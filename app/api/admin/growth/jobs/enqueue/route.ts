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

  let body: { type: string; payload?: Record<string, unknown>; runAfter?: string };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  if (!body?.type || typeof body.type !== "string") {
    return growthJsonError("Missing or invalid type", "BAD_REQUEST", 400);
  }

  const runAfter = body.runAfter ? new Date(body.runAfter) : undefined;
  if (runAfter !== undefined && Number.isNaN(runAfter.getTime())) {
    return growthJsonError("Invalid runAfter date", "BAD_REQUEST", 400);
  }

  try {
    const { jobId } = await enqueueJob({
      type: body.type,
      payload: body.payload ?? {},
      runAfter,
    });
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
