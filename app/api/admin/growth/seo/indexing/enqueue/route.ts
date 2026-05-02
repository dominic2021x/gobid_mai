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

  let body: { urls?: string[] };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];

  try {
    const { jobId } = await enqueueJob({
      type: "seo_index_request",
      payload: { urls },
    });
    return NextResponse.json({ jobId, count: urls.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
