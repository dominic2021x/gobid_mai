/**
 * POST /api/admin/search/suggestions/regenerate
 * Admin-only. Triggers suggestion seed from titles (single, recent, or full with optional multiple batches).
 * Body: { mode: "single" | "recent" | "full" | "next", listingId?: string, limit?: number, batches?: number }
 * For mode "full", batches (1–500) = câte batch-uri consecutive să ruleze (1 batch = 500 anunțuri).
 * Safe for serverless: bounded total work per request.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import {
  runSeedFromTitlesBatch,
  type ProductSuggestionLogEntry,
} from "@/lib/search/suggestions/seedFromTitles";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LIMIT = 500;
/** Practic fără limită; serverless timeout (~60s) poate opri la multe batch-uri. */
const MAX_BATCHES = 500;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  let body: { mode?: string; listingId?: string; limit?: number; batches?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const mode =
    body.mode === "single" || body.mode === "recent" || body.mode === "full" || body.mode === "next"
      ? body.mode
      : "recent";
  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : undefined;
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
      : 100;
  const batches =
    mode === "full" && typeof body.batches === "number" && Number.isFinite(body.batches)
      ? Math.min(MAX_BATCHES, Math.max(1, Math.floor(body.batches)))
      : 1;

  if (mode === "single" && (!listingId || listingId.length === 0)) {
    return NextResponse.json(
      { ok: false, error: "mode 'single' requires listingId" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  try {
    if (mode === "full" && batches > 1) {
      const startMs = Date.now();
      let totalProcessed = 0;
      let totalExtracted = 0;
      let totalUpserted = 0;
      let totalDeduplicated = 0;
      let totalUniqueSent = 0;
      let totalCapDrop = 0;
      let batchesRun = 0;
      const mergedLog: ProductSuggestionLogEntry[] = [];
      let lastResult = await runSeedFromTitlesBatch(supabase, {
        mode: "full",
        batchSize: 500,
        prioritizeNeedsReindex: true,
        includeProductSuggestionLog: true,
      });
      if (lastResult.product_suggestion_log?.length) mergedLog.push(...lastResult.product_suggestion_log);
      batchesRun = 1;
      totalProcessed += lastResult.processed_listings;
      totalExtracted += lastResult.extracted_candidates;
      totalUpserted += lastResult.distinct_upserted;
      totalDeduplicated += lastResult.deduplicated_in_batch;
      totalUniqueSent += lastResult.unique_phrases_sent_to_db;
      totalCapDrop += lastResult.candidates_dropped_cap ?? 0;

      for (let i = 1; i < batches; i++) {
        lastResult = await runSeedFromTitlesBatch(supabase, {
          batchSize: 500,
          prioritizeNeedsReindex: false,
          includeProductSuggestionLog: true,
        });
        if (lastResult.product_suggestion_log?.length) mergedLog.push(...lastResult.product_suggestion_log);
        batchesRun += 1;
        totalProcessed += lastResult.processed_listings;
        totalExtracted += lastResult.extracted_candidates;
        totalUpserted += lastResult.distinct_upserted;
        totalDeduplicated += lastResult.deduplicated_in_batch;
        totalUniqueSent += lastResult.unique_phrases_sent_to_db;
        totalCapDrop += lastResult.candidates_dropped_cap ?? 0;
        if (lastResult.processed_listings === 0) break;
      }

      return NextResponse.json({
        ok: true,
        mode: "full",
        batches_run: batchesRun,
        processed_listings: totalProcessed,
        extracted_candidates: totalExtracted,
        unique_phrases_sent_to_db: totalUniqueSent,
        deduplicated_in_batch: totalDeduplicated,
        distinct_upserted: totalUpserted,
        duplicates_skipped: totalDeduplicated,
        candidates_dropped_cap: totalCapDrop > 0 ? totalCapDrop : undefined,
        last_updated_at: lastResult.last_updated_at,
        last_id: lastResult.last_id,
        elapsed_ms: Date.now() - startMs,
        total_suggestions_in_db: lastResult.total_suggestions_in_db,
        total_suggestions_after_seed: lastResult.total_suggestions_after_seed,
        entity_type_distribution: lastResult.entity_type_distribution,
        reason: lastResult.reason,
        product_suggestion_log: mergedLog,
      });
    }

    const result = await runSeedFromTitlesBatch(supabase, {
      mode,
      listingId: mode === "single" ? listingId : undefined,
      limit: mode === "recent" ? limit : undefined,
      batchSize: mode === "full" || mode === "next" ? 500 : Math.min(limit, 500),
      prioritizeNeedsReindex: mode === "next" ? false : true,
    });
    return NextResponse.json({
      ok: true,
      mode,
      batches_run: 1,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/suggestions/regenerate]", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
