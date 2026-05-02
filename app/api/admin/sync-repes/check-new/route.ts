/**
 * GET – verifică câte anunțuri sunt pe primele N pagini REPES și câte sunt noi.
 * Query: ?stream=1 – răspuns stream (SSE) cu log live pe fiecare pagină și număr anunțuri după fiecare.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { launchRepesBrowser, fetchRepesListingPageWithPage, delay } from "@/lib/scraper-repes/http";
import { parseRepesListingPage, getRepesLastPage } from "@/lib/scraper-repes/parseListing";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 800; // Vercel Pro max

const BASE_LISTING_URL = "https://prod.executori.ro/repes";
const DEFAULT_PAGES = 112;
const MAX_PAGES_ALLOWED = 112;
const IDS_CHUNK_SIZE = 150;

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

type SendLog = (msg: string) => void;

async function runScan(
  requestedPages: number,
  sendLog: SendLog
): Promise<{ success: boolean; totalOnPage?: number; existingCount?: number; newCount?: number; pagesScanned?: number; lastPageOnSite?: number; message?: string; error?: string }> {
  const allExternalIds: string[] = [];
  let lastPageFromSite = 1;

  sendLog(`Început verificare. Pagini de scanat: ${requestedPages} (un singur browser).`);

  let launched: Awaited<ReturnType<typeof launchRepesBrowser>> | null = null;
  try {
    launched = await launchRepesBrowser();
    const page = launched.page;

    for (let p = 1; p <= requestedPages; p++) {
      const pageUrl = buildListingPageUrl(p);
      sendLog(`Pagină ${p}/${requestedPages} | URL: ${pageUrl}`);
      let html: string;
      try {
        html = await fetchRepesListingPageWithPage(page, pageUrl, { timeoutMs: 35000 });
      } catch (err) {
        sendLog(`Pagină ${p} | EROARE, skip: ${err instanceof Error ? err.message : String(err)}`);
        await delay(500);
        continue;
      }

      const cards = parseRepesListingPage(html, pageUrl);
      if (p === 1 && cards.length > 0) lastPageFromSite = getRepesLastPage(html);

      const totalBefore = allExternalIds.length;
      cards.forEach((c) => {
        if (c.externalId && !allExternalIds.includes(c.externalId)) allExternalIds.push(c.externalId);
      });
      const newOnThisPage = allExternalIds.length - totalBefore;
      const runningTotal = allExternalIds.length;

      if (newOnThisPage === 0 && cards.length > 0) {
        sendLog(`Pagină ${p} | ${cards.length} carduri dar 0 NOI (duplicat – lista neschimbată, SPA n-a încărcat pagina ${p}) | Total cumulat: ${runningTotal}`);
      } else {
        sendLog(`Pagină ${p} | Carduri: ${cards.length} | Noi pe această pagină: ${newOnThisPage} | Total cumulat: ${runningTotal}`);
      }
      await delay(5000);
    }

    if (launched) await launched.browser.close();
    launched = null;

    sendLog(`Scanare terminată. Total anunțuri (unic): ${allExternalIds.length}`);
  } catch (err) {
    sendLog(`EROARE: ${err instanceof Error ? err.message : String(err)}`);
    if (launched) await launched.browser.close();
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      message: "Eroare la pornirea browserului sau scanare REPES.",
    };
  }

  const totalOnPage = allExternalIds.length;

  if (totalOnPage === 0) {
    return {
      success: true,
      totalOnPage: 0,
      existingCount: 0,
      newCount: 0,
      pagesScanned: requestedPages,
      lastPageOnSite: lastPageFromSite,
      message: "Nu s-au găsit anunțuri pe primele " + requestedPages + " pagini REPES.",
    };
  }

  const existingIds = new Set<string>();
  for (let i = 0; i < allExternalIds.length; i += IDS_CHUNK_SIZE) {
    const chunk = allExternalIds.slice(i, i + IDS_CHUNK_SIZE);
    const { data: rows } = await supabaseAdmin!
      .from("repes_listings")
      .select("source_external_id")
      .in("source_external_id", chunk);
    (rows || []).forEach((r: { source_external_id: string }) => existingIds.add(r.source_external_id));
  }

  const newCount = allExternalIds.filter((id) => !existingIds.has(id)).length;
  const existingCount = allExternalIds.filter((id) => existingIds.has(id)).length;
  const pagesScanned = requestedPages;

  sendLog(`Sfârșit. Total: ${totalOnPage} | Noi: ${newCount} | Deja în DB: ${existingCount} | Pagini scanate: ${pagesScanned}`);

  const message =
    newCount > 0
      ? "Pe primele " + pagesScanned + " pagini: " + totalOnPage + " anunțuri, " + newCount + " noi (site: " + lastPageFromSite + " pagini)."
      : "Pe primele " + pagesScanned + " pagini: " + totalOnPage + " anunțuri, toate sunt deja în baza de date (site: " + lastPageFromSite + " pagini).";

  return {
    success: true,
    totalOnPage,
    existingCount,
    newCount,
    pagesScanned,
    lastPageOnSite: lastPageFromSite,
    message,
  };
}

export async function GET(request: NextRequest) {
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

  const requestedPages = Math.min(
    MAX_PAGES_ALLOWED,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("pages") || String(DEFAULT_PAGES), 10) || DEFAULT_PAGES)
  );
  const stream = request.nextUrl.searchParams.get("stream") === "1";

  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        const sendLog = (msg: string) => {
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ t: "log", msg }) + "\n\n"));
        };
        try {
          const result = await runScan(requestedPages, sendLog);
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ t: "result", ...result }) + "\n\n"));
        } catch (e) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ t: "result", success: false, error: String(e) }) + "\n\n"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const result = await runScan(requestedPages, (msg) => console.log("[REPES check-new]", msg));
  if (!result.success && result.error) {
    return NextResponse.json({ success: false, error: result.error, message: result.message }, { status: 502 });
  }
  return NextResponse.json(result);
}
