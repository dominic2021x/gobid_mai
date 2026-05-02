/**
 * POST /api/admin/search/suggestions/recompute-ranking
 * Admin-only. Recomputes quality_score and rank_score from daily_stats (no re-seeding).
 * Calls same aggregation logic as cron job; idempotent and safe for serverless.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { runAggregateSuggestionStats } from "@/lib/search/suggestions/aggregateSuggestionStats";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  try {
    const result = await runAggregateSuggestionStats(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/suggestions/recompute-ranking]", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
