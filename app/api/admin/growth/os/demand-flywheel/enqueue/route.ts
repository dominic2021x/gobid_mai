import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enqueueJob } from "@/lib/growth/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_TYPES = ["demand_flywheel_refresh", "demand_flywheel_execute", "demand_flywheel_feedback_eval"] as const;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  const o = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const type = typeof o.type === "string" ? o.type : "";
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: "Invalid type; use demand_flywheel_refresh, demand_flywheel_execute, or demand_flywheel_feedback_eval", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  const { jobId } = await enqueueJob({ type, payload: {} }, supabase);
  return NextResponse.json({ ok: true, jobId });
}
