/**
 * Cron job: seed search suggestions from listing titles.
 * Replaces OpenClaw openclaw_seed_suggestions job with direct execution.
 *
 * GET /api/jobs/seed-suggestions
 * Query: batchSize (optional, 1–1000, default from env SEED_SUGGESTIONS_BATCH_SIZE or 500)
 * Auth: CRON_SECRET (Authorization: Bearer <secret> or x-cron-secret header)
 *
 * - Uses agent_state cursor (openclaw_seed_suggestions); idempotent.
 * - Safe early exit when no products (processed_listings === 0).
 * - Single batch per run; next cron run continues from cursor.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { runSeedFromTitlesBatch } from "@/lib/search/suggestions/seedFromTitles";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 500;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 1000;

function parseBatchSize(value: string | null): number {
  if (value == null || value === "") return DEFAULT_BATCH_SIZE;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, n));
}

export async function GET(request: NextRequest) {
  try {
    await requireCronSecret(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl ?? new URL(request.url);
  const batchSizeParam = url.searchParams.get("batchSize");
  const batchSize =
    process.env.SEED_SUGGESTIONS_BATCH_SIZE != null
      ? parseBatchSize(process.env.SEED_SUGGESTIONS_BATCH_SIZE)
      : parseBatchSize(batchSizeParam);

  const supabase = createAdminClient();

  try {
    const result = await runSeedFromTitlesBatch(supabase, {
      batchSize,
      includeProductSuggestionLog: false,
    });
    const ok = true;
    const body = {
      ok,
      processed_listings: result.processed_listings,
      extracted_candidates: result.extracted_candidates,
      distinct_upserted: result.distinct_upserted,
      duplicates_skipped: result.duplicates_skipped,
      last_updated_at: result.last_updated_at,
      last_id: result.last_id,
      elapsed_ms: result.elapsed_ms,
      batch_size: batchSize,
      ...(result.reason != null && { reason: result.reason }),
      ...(result.total_suggestions_after_seed != null && {
        total_suggestions_after_seed: result.total_suggestions_after_seed,
      }),
      ...(result.entity_type_distribution != null && {
        entity_type_distribution: result.entity_type_distribution,
      }),
    };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[jobs/seed-suggestions]", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
