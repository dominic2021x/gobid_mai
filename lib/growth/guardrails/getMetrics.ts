import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const ONE_HOUR_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const ONE_DAY_ISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/**
 * Fast metrics for guardrail evaluation. Single indexed query per job type.
 */
export async function getGuardrailMetrics(
  supabase: SupabaseClient,
  jobType: string
): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};
  const { count } = await supabase
    .from("growth_events")
    .select("id", { count: "exact", head: true })
    .eq("type", jobType)
    .gte("created_at", ONE_HOUR_ISO);
  metrics.runs_last_hour = typeof count === "number" ? count : 0;

  if (jobType === "pseo_generate_candidates") {
    const { count: lpToday } = await supabase
      .from("seo_landing_pages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", ONE_DAY_ISO);
    metrics.lp_created_today = typeof lpToday === "number" ? lpToday : 0;
  }

  if (jobType === "demand_flywheel_execute") {
    const { count: pending } = await supabase
      .from("growth_demand_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    metrics.pending_actions = typeof pending === "number" ? pending : 0;
  }

  return metrics;
}
