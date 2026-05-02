import "server-only";
import { optimizerPlanSchema, type OptimizerPlan } from "./planSchema";

/**
 * Extract JSON from LLM response (may be wrapped in markdown code block).
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const codeBlock = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (codeBlock) return codeBlock[1].trim();
  return trimmed;
}

/**
 * Parse and validate LLM output into OptimizerPlan.
 */
export function parseAndValidatePlan(raw: string, customerId: string): OptimizerPlan {
  const jsonStr = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Invalid JSON from LLM: ${e instanceof Error ? e.message : String(e)}`);
  }
  const result = optimizerPlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = (result.error as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
    const msg = issues.length
      ? issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      : result.error.message;
    throw new Error(`Plan schema validation failed: ${msg}`);
  }
  const plan = result.data;
  if (plan.customerId !== customerId) {
    throw new Error(`Plan customerId ${plan.customerId} does not match ${customerId}`);
  }
  return plan;
}
