import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enqueueJob } from "@/lib/growth/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_TYPES = [
  "search_intel_rollup_hourly",
  "search_intel_rollup_hourly_ips",
  "search_intel_learn_weights_daily",
  "search_intel_update_query_boosts_daily",
  "search_personal_rollup_daily",
] as const;

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
      { error: `Invalid type; use one of: ${ALLOWED_TYPES.join(", ")}`, code: "BAD_REQUEST" },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  const { jobId } = await enqueueJob({ type, payload: {} }, supabase);
  return NextResponse.json({ ok: true, jobId });
}
