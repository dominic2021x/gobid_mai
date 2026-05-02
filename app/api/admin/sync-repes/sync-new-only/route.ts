/**
 * POST – sincronizează doar anunțurile noi REPES (care nu sunt în baza de date).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { launchRepesBrowser, fetchRepesListingPageWithPage, fetchRepesHtml, fetchRepesHtmlWithBrowser, delay } from "@/lib/scraper-repes/http";
import { parseRepesListingPage, getRepesLastPage } from "@/lib/scraper-repes/parseListing";
import { parseRepesDetailPage } from "@/lib/scraper-repes/parseDetail";
import { inferRepesCategories } from "@/lib/repes/inferCategories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 800; // Vercel Pro max

const BASE_LISTING_URL = "https://prod.executori.ro/repes";
const DELAY_PAGE_MS = 5000;
const DELAY_DETAIL_MS = 800;
/** Toate cele 112 pagini REPES – scanare completă, fără limită de anunțuri. */
const MAX_PAGES_TO_SCAN = 112;
const MAX_NEW_TO_INSERT = 10000;
const IDS_CHUNK_SIZE = 150;

/** REPES folosește ?pageIdx=0, ?pageIdx=1, ?pageIdx=2 ... (0-based). */
function buildListingPageUrl(page: number): string {
  if (page <= 1) return `${BASE_LISTING_URL}?pageIdx=0`;
  return `${BASE_LISTING_URL}?pageIdx=${page - 1}`;
}

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  const envSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get("authorization");
  let allowed = false;
  if (envSecret && secret === envSecret) {
    allowed = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
      if (await isAdminUser(user)) allowed = true;
    } catch {
      // ignore
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const db = supabaseAdmin;

  const useStream = request.headers.get("x-sync-stream") === "1";

  type SendLog = (msg: string) => void;
  async function runSyncNewOnly(sendLog: SendLog): Promise<{ success: boolean; inserted: number; failed: number; errors: string[]; message: string }> {
    const nowIso = new Date().toISOString();
    const allCards = new Map<string, { externalId: string; detailUrl: string }>();
    let maxPagesToScan = MAX_PAGES_TO_SCAN;

    sendLog("Început sincronizare anunțuri noi. Un singur browser.");

    let launched: Awaited<ReturnType<typeof launchRepesBrowser>> | null = null;
    try {
      launched = await launchRepesBrowser();
      const listingPage = launched.page;

      for (let page = 1; page <= maxPagesToScan; page++) {
        const pageUrl = buildListingPageUrl(page);
        sendLog(`Pagină ${page} | URL: ${pageUrl}`);
        let html: string;
        try {
          html = await fetchRepesListingPageWithPage(listingPage, pageUrl, { timeoutMs: 35000 });
        } catch (browserErr) {
          sendLog(`Pagină ${page} | Eroare, skip: ${browserErr instanceof Error ? browserErr.message : String(browserErr)}`);
          await delay(DELAY_PAGE_MS);
          continue;
        }
        const cards = parseRepesListingPage(html, pageUrl);
        if (page === 1 && cards.length > 0) {
          const lastPageOnSite = getRepesLastPage(html);
          if (lastPageOnSite > 0) {
            maxPagesToScan = Math.min(MAX_PAGES_TO_SCAN, lastPageOnSite);
            sendLog(`Paginator: Pagina 1 din ${lastPageOnSite} → scan până la ${maxPagesToScan}`);
          }
        }
        sendLog(`Pagină ${page} | Carduri: ${cards.length}`);
        cards.forEach((c) => {
          if (c.externalId) allCards.set(c.externalId, { externalId: c.externalId, detailUrl: c.detailUrl });
        });
        await delay(5000);
      }
    } finally {
      if (launched) await launched.browser.close();
    }

    const externalIds = Array.from(allCards.keys());
    sendLog(`Total carduri: ${externalIds.length}`);

    if (externalIds.length === 0) {
      return { success: true, inserted: 0, failed: 0, errors: [], message: "Nu s-au găsit anunțuri." };
    }

    const existingIds = new Set<string>();
    for (let i = 0; i < externalIds.length; i += IDS_CHUNK_SIZE) {
      const chunk = externalIds.slice(i, i + IDS_CHUNK_SIZE);
      const { data: rows } = await db
        .from("repes_listings")
        .select("source_external_id")
        .in("source_external_id", chunk);
      (rows || []).forEach((r: { source_external_id: string }) => existingIds.add(r.source_external_id));
    }

    const newIds = externalIds.filter((id) => !existingIds.has(id)).slice(0, MAX_NEW_TO_INSERT);
    sendLog(`Deja în DB: ${existingIds.size} | Noi de inserat: ${newIds.length}`);

    if (newIds.length === 0) {
      return { success: true, inserted: 0, failed: 0, errors: [], message: "Toate sunt deja în baza de date." };
    }

    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];
    const totalNew = newIds.length;

    for (let idx = 0; idx < newIds.length; idx++) {
      const externalId = newIds[idx];
      const card = allCards.get(externalId);
      if (!card?.detailUrl) {
        sendLog(`Anunț ${idx + 1}/${totalNew} | ${externalId} | SKIP (fără URL)`);
        continue;
      }
      sendLog(`Anunț ${idx + 1}/${totalNew} | ${externalId} | ${(card.detailUrl || "").slice(0, 50)}…`);
      try {
        let html = await fetchRepesHtml(card.detailUrl);
        let detail = parseRepesDetailPage(html, card.detailUrl);
        const looksEmpty = (!detail.title || detail.title === "Fără titlu") && !detail.descriptionHtml;
        if (looksEmpty) {
          try {
            html = await fetchRepesHtmlWithBrowser(card.detailUrl, { timeoutMs: 35000 });
            detail = parseRepesDetailPage(html, card.detailUrl);
          } catch (_be) {
            // keep fetch result
          }
        }
        await delay(DELAY_DETAIL_MS);

        const auctionDate = detail.auctionDate && detail.auctionTime
          ? `${detail.auctionDate}T${detail.auctionTime}:00`
          : detail.auctionDate;

        const { main_category, category } = inferRepesCategories(detail.title, detail.descriptionHtml);

        const { data: insertedRow, error: insertError } = await db
          .from("repes_listings")
          .insert({
            source_external_id: externalId,
            source_url: card.detailUrl,
            title: detail.title,
            price_text: detail.priceText,
            location_raw: detail.locationRaw,
            description_html: detail.descriptionHtml,
            main_category,
            category,
            seller_name: detail.sellerName,
            seller_email: detail.sellerEmail,
            seller_phone: detail.sellerPhone,
            seller_address: detail.sellerAddress,
            pdf_url: detail.pdfUrl,
            auction_date: auctionDate || null,
            auction_time: detail.auctionTime,
            meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : null,
            last_seen_at: nowIso,
            deleted_at: null,
          })
          .select("id")
          .single();

        if (insertError) {
          failed++;
          errors.push(`${externalId}: ${insertError.message}`);
          sendLog(`Anunț ${idx + 1} | EROARE: ${insertError.message}`);
          continue;
        }

        const listingId = (insertedRow as { id: string })?.id;
        if (listingId && detail.imageUrls.length > 0) {
          const imageRows = detail.imageUrls.map((url, i) => ({ listing_id: listingId, url, sort_order: i }));
          await db.from("repes_listing_images").insert(imageRows);
        }
        inserted++;
        sendLog(`Anunț ${idx + 1}/${totalNew} | OK | id: ${listingId}`);
      } catch (e) {
        failed++;
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`${externalId}: ${errMsg}`);
        sendLog(`Anunț ${idx + 1} | Excepție: ${errMsg}`);
      }
    }

    sendLog(`Sfârșit. Inserate: ${inserted} | Eșecuri: ${failed}`);
    return {
      success: true,
      inserted,
      failed,
      errors,
      message: `Inserate ${inserted} anunțuri noi, ${failed} eșecuri.`,
    };
  }

  if (useStream) {
    const encoder = new TextEncoder();
    const readStream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        const sendLog = (msg: string) => send({ type: "log", msg });
        try {
          const result = await runSyncNewOnly(sendLog);
          send({ type: "done", ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send({ type: "done", success: false, error: message, inserted: 0, failed: 0, errors: [], message });
        } finally {
          controller.close();
        }
      },
    });
    return new NextResponse(readStream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const result = await runSyncNewOnly(() => {});
  return NextResponse.json(result);
}
