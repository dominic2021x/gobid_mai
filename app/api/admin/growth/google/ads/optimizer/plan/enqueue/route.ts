import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
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

  let body: { force?: boolean };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const { jobId } = await enqueueJob({
      type: "google_ads_optimizer_plan",
      payload: { force: body.force === true },
    });
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
