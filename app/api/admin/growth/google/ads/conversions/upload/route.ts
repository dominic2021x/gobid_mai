import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


interface ConversionInput {
  gclid: string;
  conversionAction: string;
  conversionDateTime: string;
  conversionValue?: number;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { conversions?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }
  const conversions = Array.isArray(body.conversions) ? body.conversions : [];
  if (conversions.length === 0) {
    return growthJsonError("Missing or empty conversions array", "BAD_REQUEST", 400);
  }
  for (const c of conversions) {
    const o = c as Record<string, unknown>;
    if (!o.gclid || !o.conversionAction || !o.conversionDateTime) {
      return growthJsonError("Each conversion must have gclid, conversionAction, conversionDateTime", "BAD_REQUEST", 400);
    }
  }
  const payload = conversions.map((c) => {
    const o = c as ConversionInput;
    return {
      gclid: String(o.gclid),
      conversionAction: String(o.conversionAction),
      conversionDateTime: String(o.conversionDateTime),
      conversionValue: typeof o.conversionValue === "number" ? o.conversionValue : undefined,
    };
  });

  try {
    const { jobId } = await enqueueJob({
      type: "google_ads_conversions_upload",
      payload: { conversions: payload },
    });
    return NextResponse.json({ jobId, count: payload.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
