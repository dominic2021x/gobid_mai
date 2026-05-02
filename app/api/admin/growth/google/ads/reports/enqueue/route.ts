import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";
import { ALLOWLISTED_GAQL } from "@/lib/google/apis/googleAds";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { queryId?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const queryId = (body.queryId as string) || "campaign_performance";
  if (!ALLOWLISTED_GAQL[queryId]) {
    return growthJsonError("Query not allowlisted", "BAD_REQUEST", 400);
  }

  try {
    const { jobId } = await enqueueJob({ type: "google_ads_report", payload: { queryId } });
    return NextResponse.json({ jobId, queryId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
