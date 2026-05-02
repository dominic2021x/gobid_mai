/**
 * POST – actualizează doar titlurile (title) pentru anunțuri.
 * Body: { ids?: string[], onlyMissing?: boolean } – ids: doar acele anunțuri; altfel toate active (max 1000). onlyMissing: doar cele fără titlu.
 * Header x-titles-stream: 1 → răspuns NDJSON cu log live (type: "log" per anunț, type: "done" la final).
 * Procesare la rând. Returnează results[] cu numerotare și eroare per anunț.
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
  title?: string;
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
  let onlyMissing = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      ids = body.ids.slice(0, MAX_LISTINGS);
    }
    onlyMissing = body?.onlyMissing === true;
  } catch {
    // keep defaults
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
    let query = db
      .from("licitatii_insolventa_listings")
      .select("id, source_url, source_external_id")
      .is("deleted_at", null)
      .not("source_url", "is", null)
      .limit(MAX_LISTINGS);

    if (onlyMissing) {
      query = query.or("title.is.null,title.eq.");
    }
    const { data: listings, error: listError } = await query;

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
      message: ids?.length ? "Niciun anunț valid pentru ID-urile selectate." : onlyMissing ? "Niciun anunț fără titlu." : "Niciun anunț de procesat.",
    });
  }

  const useStream = request.headers.get("x-titles-stream") === "1";

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        const results: ItemResult[] = [];
        let updated = 0;
        const total = toProcess.length;
        for (let i = 0; i < toProcess.length; i++) {
          const listing = toProcess[i];
          const index = i + 1;
          try {
            const html = await fetchHtml(listing.source_url);
            await delay(DELAY_MS);
            const detail = parseDetailPage(html, listing.source_url);
            const title = detail.title?.trim() || null;

            const { error: updateError } = await db
              .from("licitatii_insolventa_listings")
              .update({
                title,
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
              send({
                type: "log",
                index,
                total,
                source_external_id: listing.source_external_id,
                success: false,
                error: updateError.message,
                updated,
                failed: index - updated,
              });
            } else {
              results.push({
                index,
                id: listing.id,
                source_external_id: listing.source_external_id,
                success: true,
                title: title ?? undefined,
              });
              updated++;
              send({
                type: "log",
                index,
                total,
                source_external_id: listing.source_external_id,
                success: true,
                title: title ?? undefined,
                updated,
                failed: index - updated,
              });
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
            send({
              type: "log",
              index,
              total,
              source_external_id: listing.source_external_id,
              success: false,
              error: msg,
              updated,
              failed: index - updated,
            });
          }
        }
        const failed = total - updated;
        send({ type: "done", success: true, total, updated, failed, results });
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
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
      const title = detail.title?.trim() || null;

      const { error: updateError } = await db
        .from("licitatii_insolventa_listings")
        .update({
          title,
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
          title: title ?? undefined,
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
    message: `Procesate ${toProcess.length}: ${updated} titluri actualizate, ${failed} eșecuri.`,
  });
}
