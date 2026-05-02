/**
 * Cron job: aggregate search_suggestion_events into daily_stats and recompute rank/quality scores.
 * GET /api/jobs/aggregate-suggestion-stats
 * Auth: CRON_SECRET. Incremental, idempotent, bounded for Vercel.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { runAggregateSuggestionStats } from "@/lib/search/suggestions/aggregateSuggestionStats";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireCronSecret(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  try {
    const result = await runAggregateSuggestionStats(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aggregate-suggestion-stats]", err);
    return NextResponse.json(
      { ok: false, aggregated_days: 0, updated_suggestions: 0, error: msg },
      { status: 500 }
    );
  }
}
