/**
 * Cron job: aggregate search_autocorrect_events into search_autocorrect_daily_stats.
 * GET /api/jobs/aggregate-autocorrect-stats
 * Auth: CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { runAggregateAutocorrectStats } from "@/lib/search/autocorrect/aggregateAutocorrectStats";

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
    const result = await runAggregateAutocorrectStats(supabase);
    if (result.error) {
      return NextResponse.json(
        { ok: false, aggregated_days: result.aggregated_days, rows_upserted: result.rows_upserted, error: result.error },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      aggregated_days: result.aggregated_days,
      rows_upserted: result.rows_upserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aggregate-autocorrect-stats]", err);
    return NextResponse.json(
      { ok: false, aggregated_days: 0, rows_upserted: 0, error: msg },
      { status: 500 }
    );
  }
}
