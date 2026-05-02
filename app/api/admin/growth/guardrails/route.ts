import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  const [guardrailsRes, violationsRes] = await Promise.all([
    supabase.from("growth_guardrails").select("id, guardrail_type, scope, metric, min_value, max_value, action, enabled, applies_to_job_types, created_at").order("created_at", { ascending: false }),
    supabase.from("growth_guardrail_violations").select("id, guardrail_id, job_type, metric_value, decision, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  return NextResponse.json({
    guardrails: guardrailsRes.data ?? [],
    violations: violationsRes.data ?? [],
  });
}
