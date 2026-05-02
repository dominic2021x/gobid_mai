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
  const days = typeof body.days === "number" && body.days > 0 ? Math.min(body.days, 365) : 28;

  try {
    const { jobId } = await enqueueJob({
      type: "ga4_report_pull",
      payload: { days },
    });
    return NextResponse.json({ jobId, days });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
