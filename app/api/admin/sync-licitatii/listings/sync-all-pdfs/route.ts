/**
 * POST – actualizează doar PDF-urile (pdf_url, pdf_urls) pentru anunțuri.
 * Body: { ids?: string[] } – dacă ids e prezent și nevid, se procesează doar acele anunțuri; altfel toate active (max 1000).
 * Procesare la rând. Returnează results[] cu numerotare, pdfCount și eroare per anunț.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml, delay } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

const DELAY_MS = 500;
const MAX_LISTINGS = 1000;
const IDS_CHUNK_SIZE = 150;

type ItemResult = {
  index: number;
  id: string;
  source_external_id: string;
  success: boolean;
  error?: string;
  pdfCount?: number;
};

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

  let ids: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      ids = body.ids.slice(0, MAX_LISTINGS);
    }
  } catch {
    // keep undefined
  }

  let toProcess: { id: string; source_url: string; source_external_id: string }[];

  if (ids && ids.length > 0) {
    const allListings: { id: string; source_url: string; source_external_id: string }[] = [];
    for (let o = 0; o < ids.length; o += IDS_CHUNK_SIZE) {
      const chunk = ids.slice(o, o + IDS_CHUNK_SIZE);
      const { data: listings, error: listError } = await db
        .from("licitatii_insolventa_listings")
        .select("id, source_url, source_external_id")
        .in("id", chunk)
        .not("source_url", "is", null);

      if (listError) {
        return NextResponse.json({ error: `Listare anunțuri: ${listError.message}` }, { status: 500 });
      }
      allListings.push(...((listings || []) as { id: string; source_url: string; source_external_id: string }[]));
    }
    toProcess = allListings;
  } else {
    const { data: listings, error: listError } = await db
      .from("licitatii_insolventa_listings")
      .select("id, source_url, source_external_id")
      .is("deleted_at", null)
      .not("source_url", "is", null)
      .limit(MAX_LISTINGS);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }
    toProcess = (listings || []) as { id: string; source_url: string; source_external_id: string }[];
  }

  if (toProcess.length === 0) {
    return NextResponse.json({
      success: true,
      total: 0,
      updated: 0,
      failed: 0,
      results: [],
      message: ids?.length ? "Niciun anunț valid găsit pentru ID-urile selectate." : "Niciun anunț de procesat.",
    });
  }

  const results: ItemResult[] = [];
  let updated = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const listing = toProcess[i];
    const index = i + 1;
    try {
      const html = await fetchHtml(listing.source_url);
      await delay(DELAY_MS);
      const detail = parseDetailPage(html, listing.source_url);

      const pdfUrls = detail.pdfUrls ?? [];
      const pdfUrl = pdfUrls[0] ?? null;

      const { error: updateError } = await db
        .from("licitatii_insolventa_listings")
        .update({
          pdf_url: pdfUrl,
          pdf_urls: pdfUrls.length > 0 ? pdfUrls : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);

      if (updateError) {
        results.push({
          index,
          id: listing.id,
          source_external_id: listing.source_external_id,
          success: false,
          error: updateError.message,
        });
      } else {
        results.push({
          index,
          id: listing.id,
          source_external_id: listing.source_external_id,
          success: true,
          pdfCount: pdfUrls.length,
        });
        updated++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        index,
        id: listing.id,
        source_external_id: listing.source_external_id,
        success: false,
        error: msg,
      });
    }
  }

  const failed = toProcess.length - updated;
  return NextResponse.json({
    success: true,
    total: toProcess.length,
    updated,
    failed,
    results,
    message: `Procesate ${toProcess.length}: ${updated} actualizate (PDF-uri), ${failed} eșecuri.`,
  });
}
