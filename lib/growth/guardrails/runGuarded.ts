import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateGuardrails } from "./evaluate";
import { getGuardrailMetrics } from "./getMetrics";

/**
 * Run a job handler with guardrail evaluation. If decision === "block", skip execution
 * and log violations. Returns handler result otherwise.
 */
export async function runWithGuardrails<T>(
  supabase: SupabaseClient,
  jobType: string,
  correlationId: string,
  runHandler: () => Promise<T>
): Promise<T> {
  const metrics = await getGuardrailMetrics(supabase, jobType);
  const { decision, violations } = await evaluateGuardrails(supabase, {
    jobType,
    metrics,
  });

  if (violations.length > 0) {
    for (const v of violations) {
      await supabase.from("growth_guardrail_violations").insert({
        guardrail_id: v.guardrailId,
        job_type: jobType,
        metric_value: v.metricValue,
        decision: v.action,
      });
    }
    await supabase.from("growth_events").insert({
      type: "guardrail_violation",
      meta: {
        correlationId,
        jobType,
        decision,
        violations: violations.map((x) => ({
          guardrailType: x.guardrailType,
          metric: x.metric,
          metricValue: x.metricValue,
          action: x.action,
        })),
      },
    });
  }

  if (decision === "block") {
    return {
      ok: true,
      meta: { skipped: true, reason: "guardrail_block", violations: violations.length },
    } as T;
  }

  return runHandler();
}
