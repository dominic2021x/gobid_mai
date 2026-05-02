import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GuardrailViolation {
  guardrailId: string;
  guardrailType: string;
  metric: string;
  metricValue: number;
  minValue: number | null;
  maxValue: number | null;
  action: "allow" | "warn" | "block";
  scope: string;
}

export interface EvaluateResult {
  decision: "allow" | "warn" | "block";
  violations: GuardrailViolation[];
}

interface GuardrailRow {
  id: string;
  guardrail_type: string;
  scope: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  action: "allow" | "warn" | "block";
  applies_to_job_types: string[] | null;
}

const GUARDED_JOB_TYPES = new Set([
  "google_ads_optimizer_auto_apply",
  "pseo_generate_candidates",
  "pseo_score_and_promote",
  "demand_flywheel_execute",
  "seo_flywheel_rank_opportunities",
]);

let cache: { rows: GuardrailRow[]; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getGuardrails(supabase: SupabaseClient): Promise<GuardrailRow[]> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.rows;
  const { data } = await supabase
    .from("growth_guardrails")
    .select("id, guardrail_type, scope, metric, min_value, max_value, action, applies_to_job_types")
    .eq("enabled", true);
  const rows = (data ?? []) as GuardrailRow[];
  cache = { rows, ts: now };
  return rows;
}

function appliesToJob(guardrail: GuardrailRow, jobType: string): boolean {
  const arr = guardrail.applies_to_job_types;
  if (!arr || arr.length === 0) return true;
  return arr.includes(jobType);
}

function isViolation(
  metricValue: number,
  minVal: number | null,
  maxVal: number | null
): boolean {
  if (minVal != null && metricValue < minVal) return true;
  if (maxVal != null && metricValue > maxVal) return true;
  return false;
}

/**
 * Evaluate guardrails for a job. Returns allow/warn/block and any violations.
 * Use before executing guarded job handlers.
 */
export async function evaluateGuardrails(
  supabase: SupabaseClient,
  params: { jobType: string; metrics: Record<string, number> }
): Promise<EvaluateResult> {
  const { jobType, metrics } = params;
  if (!GUARDED_JOB_TYPES.has(jobType)) {
    return { decision: "allow", violations: [] };
  }
  const guardrails = await getGuardrails(supabase);
  const violations: GuardrailViolation[] = [];
  for (const g of guardrails) {
    if (!appliesToJob(g, jobType)) continue;
    const metricValue = metrics[g.metric];
    if (metricValue == null || !Number.isFinite(metricValue)) continue;
    const minVal = g.min_value != null ? Number(g.min_value) : null;
    const maxVal = g.max_value != null ? Number(g.max_value) : null;
    if (!isViolation(metricValue, minVal, maxVal)) continue;
    violations.push({
      guardrailId: g.id,
      guardrailType: g.guardrail_type,
      metric: g.metric,
      metricValue,
      minValue: minVal,
      maxValue: maxVal,
      action: g.action,
      scope: g.scope,
    });
  }
  if (violations.some((v) => v.action === "block"))
    return { decision: "block", violations };
  if (violations.some((v) => v.action === "warn"))
    return { decision: "warn", violations };
  return { decision: "allow", violations };
}
