import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { planId?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const planId = body.planId as string | undefined;
  if (!planId) {
    return growthJsonError("Missing planId", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const { data: planRow, error: fetchErr } = await supabase
    .from("growth_ai_plans")
    .select("id, status")
    .eq("id", planId)
    .single();

  if (fetchErr || !planRow) {
    return growthJsonError("Plan not found", "NOT_FOUND", 404);
  }
  if (planRow.status !== "queued") {
    return growthJsonError(`Plan status is ${planRow.status}; only queued plans can be applied`, "BAD_REQUEST", 400);
  }

  try {
    const { jobId } = await enqueueJob({
      type: "google_ads_apply_plan",
      payload: { planId },
    });
    return NextResponse.json({ jobId, planId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
