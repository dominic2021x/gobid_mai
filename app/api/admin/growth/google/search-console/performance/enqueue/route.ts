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

  let body: { days?: number };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const days = body.days === 28 ? 28 : 7;

  try {
    const { jobId } = await enqueueJob({
      type: "gsc_performance_pull",
      payload: { days },
    });
    return NextResponse.json({ jobId, days });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
