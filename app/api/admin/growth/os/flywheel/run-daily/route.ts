import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


async function runDaily(): Promise<NextResponse> {
  const supabase = createAdminClient();
  try {
    await enqueueJob({ type: "seo_flywheel_rank_opportunities", payload: {} }, supabase);
    await enqueueJob({ type: "seo_flywheel_ctr_experiments", payload: {} }, supabase);
    await enqueueJob({ type: "seo_flywheel_hubs_generate", payload: {} }, supabase);
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
  return runDaily();
}

export async function POST(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  return runDaily();
}
