import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const DELAY_MINUTES = 30;

export async function GET(req: NextRequest) {
  try {
    await requireCronSecret(req);
  } catch {
    return growthJsonError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return runDaily(req);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  return runDaily(req);
}

async function runDaily(_req: NextRequest): Promise<NextResponse> {
  const supabase = createAdminClient();
  const enqueued: string[] = [];

  try {
    const { jobId: j1 } = await enqueueJob({ type: "google_search_console_performance_refresh", payload: { days: 7 } }, supabase);
    enqueued.push(`gsc_perf:${j1}`);

    const { jobId: j2 } = await enqueueJob({ type: "ga4_funnel_refresh", payload: {} }, supabase);
    enqueued.push(`ga4_funnel:${j2}`);

    const { jobId: j3 } = await enqueueJob({ type: "seo_growth_refresh", payload: {} }, supabase);
    enqueued.push(`seo_growth:${j3}`);

    const { jobId: j4 } = await enqueueJob({ type: "keyword_discovery_refresh", payload: {} }, supabase);
    enqueued.push(`keyword_discovery:${j4}`);

    const { jobId: j5 } = await enqueueJob({ type: "content_suggestions_refresh", payload: {} }, supabase);
    enqueued.push(`content_suggestions:${j5}`);

    const { jobId: j6 } = await enqueueJob({ type: "marketing_brain_analysis", payload: {} }, supabase);
    enqueued.push(`marketing_brain:${j6}`);

    const runAfter = new Date();
    runAfter.setMinutes(runAfter.getMinutes() + DELAY_MINUTES);
    const { jobId: j7 } = await enqueueJob(
      { type: "growth_os_daily_pack", payload: {}, runAfter },
      supabase
    );
    enqueued.push(`daily_pack:${j7}`);

    return NextResponse.json({ ok: true, enqueued });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
