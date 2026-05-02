import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const MIN_MS = 60 * 1000;

async function runPseoDaily(_req: NextRequest): Promise<NextResponse> {
  const supabase = createAdminClient();
  const now = Date.now();

  try {
    await enqueueJob({ type: "google_search_console_performance_refresh", payload: {} }, supabase);
    await enqueueJob({ type: "ga4_funnel_refresh", payload: {} }, supabase);
    await enqueueJob({ type: "seo_growth_refresh", payload: {} }, supabase);
    await enqueueJob({ type: "keyword_discovery_refresh", payload: {} }, supabase);
    await enqueueJob({ type: "pseo_generate_candidates", payload: {} }, supabase);

    await enqueueJob(
      { type: "pseo_enrich_content", payload: {}, runAfter: new Date(now + 10 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "pseo_seed_internal_links", payload: {}, runAfter: new Date(now + 15 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "seo_internal_links_apply", payload: {}, runAfter: new Date(now + 20 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "pseo_score_and_promote", payload: {}, runAfter: new Date(now + 30 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "pseo_demotion", payload: {}, runAfter: new Date(now + 35 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "growth_os_daily_pack", payload: {}, runAfter: new Date(now + 45 * MIN_MS) },
      supabase
    );
    await enqueueJob(
      { type: "marketing_brain_analysis", payload: {}, runAfter: new Date(now + 50 * MIN_MS) },
      supabase
    );

    return NextResponse.json({ ok: true, scheduled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireCronSecret(req);
  } catch {
    return growthJsonError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return runPseoDaily(req);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  return runPseoDaily(req);
}
