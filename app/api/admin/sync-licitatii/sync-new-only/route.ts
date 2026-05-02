/**
 * POST – sincronizează doar anunțurile noi (care nu sunt în baza de date).
 * Încarcă prima pagină (sau primele N pagini) de listare, identifică ID-urile noi, pentru fiecare
 * descarcă pagina de detaliu și inserează în DB. Nu actualizează existente, nu dezactivează.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml, delay } from "@/lib/scraper/http";
import { parseListingPage } from "@/lib/scraper/parseListing";
import { parseDetailPage } from "@/lib/scraper/parseDetail";
import { buildDetailUpdatePayload } from "@/lib/scraper/detailToPayload";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

const BASE_LISTING_URL = "https://www.licitatii-insolventa.ro/cauta";

function buildListingPageUrl(page: number): string {
  if (page <= 1) return BASE_LISTING_URL;
  return `${BASE_LISTING_URL}/iPage,${page}`;
}

const DELAY_PAGE_MS = 800;
const DELAY_DETAIL_MS = 1000;
const MAX_PAGES_TO_SCAN = 3;
const MAX_NEW_TO_INSERT = 100;
const IDS_CHUNK_SIZE = 150;

function sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const db = supabaseAdmin;

  const useStream = request.headers.get("x-sync-new-stream") === "1";

  const run = async (sendLog: (msg: string) => void): Promise<{ success: boolean; inserted: number; failed: number; errors: string[]; message: string; error?: string }> => {
    const allCards = new Map<string, { externalId: string; detailUrl: string }>();

    for (let page = 1; page <= MAX_PAGES_TO_SCAN; page++) {
      sendLog(`Se încarcă pagina ${page}/${MAX_PAGES_TO_SCAN}...`);
      const pageUrl = buildListingPageUrl(page);
      const html = await fetchHtml(pageUrl);
      await delay(DELAY_PAGE_MS);
      const cards = parseListingPage(html, pageUrl);
      cards.forEach((c) => {
        if (c.externalId) allCards.set(c.externalId, { externalId: c.externalId, detailUrl: c.detailUrl });
      });
    }

    const externalIds = Array.from(allCards.keys());
    if (externalIds.length === 0) {
      return { success: true, inserted: 0, failed: 0, errors: [], message: "Nu s-au găsit anunțuri pe primele pagini." };
    }

    sendLog(`Găsite ${externalIds.length} anunțuri. Se compară cu baza de date...`);
    const existingIds = new Set<string>();
    for (let i = 0; i < externalIds.length; i += IDS_CHUNK_SIZE) {
      const chunk = externalIds.slice(i, i + IDS_CHUNK_SIZE);
      const { data: rows } = await db
        .from("licitatii_insolventa_listings")
        .select("source_external_id")
        .in("source_external_id", chunk);
      (rows || []).forEach((r: { source_external_id: string }) => existingIds.add(r.source_external_id));
    }

    const newIds = externalIds.filter((id) => !existingIds.has(id)).slice(0, MAX_NEW_TO_INSERT);
    if (newIds.length === 0) {
      return { success: true, inserted: 0, failed: 0, errors: [], message: "Toate anunțurile de pe primele pagini sunt deja în baza de date." };
    }

    sendLog(`${newIds.length} anunțuri noi. Se descarcă detaliile și se inserează...`);
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let idx = 0; idx < newIds.length; idx++) {
      const externalId = newIds[idx];
      const card = allCards.get(externalId);
      if (!card?.detailUrl) continue;
      sendLog(`[${idx + 1}/${newIds.length}] ${externalId}...`);
      try {
        const html = await fetchHtml(card.detailUrl);
        await delay(DELAY_DETAIL_MS);
        const detail = parseDetailPage(html, card.detailUrl);
        const { update, imageUrls } = buildDetailUpdatePayload(detail);

        const row = sanitizePayload({
          source_external_id: externalId,
          source_url: card.detailUrl,
          ...update,
          last_seen_at: new Date().toISOString(),
          deleted_at: null,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>);

        const { data: insertedRow, error: insertError } = await db
          .from("licitatii_insolventa_listings")
          .insert(row)
          .select("id")
          .single();

        if (insertError) {
          failed++;
          errors.push(`${externalId}: ${insertError.message}`);
          continue;
        }

        const listingId = (insertedRow as { id: string })?.id;
        if (listingId && imageUrls.length > 0) {
          const imageRows = imageUrls.map((url, i) => ({ listing_id: listingId, url, sort_order: i }));
          await db.from("licitatii_insolventa_listing_images").insert(imageRows);
        }
        inserted++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${externalId}: ${msg}`);
      }
    }

    const message = `Sincronizate doar cele noi: ${inserted} inserate, ${failed} eșecuri.`;
    sendLog(message);
    return { success: true, inserted, failed, errors: errors.slice(0, 20), message };
  };

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        const sendLog = (msg: string) => send({ type: "log", message: msg });
        try {
          const result = await run(sendLog);
          send({ type: "done", success: result.success, inserted: result.inserted, failed: result.failed, message: result.message, error: result.error });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          send({ type: "done", success: false, error: msg, inserted: 0, failed: 0 });
        } finally {
          controller.close();
        }
      },
    });
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const noop = () => {};
  try {
    const result = await run(noop);
    return NextResponse.json({
      success: result.success,
      inserted: result.inserted,
      failed: result.failed,
      errors: result.errors,
      message: result.message,
      ...(result.error && { error: result.error }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg, inserted: 0, failed: 0 }, { status: 500 });
  }
}
