/**
 * Metric threshold engine — green / amber / red evaluation
 * Supports range rules and comparison rules (lte, gte)
 */

export type ThresholdRange = [number, number];
export type ThresholdCompare = { lte?: number; gte?: number };

export interface ThresholdRule {
  good?: ThresholdRange | ThresholdCompare;
  warn?: ThresholdRange | ThresholdCompare;
  bad?: ThresholdRange | ThresholdCompare;
  /** Guidance shown when status is bad */
  badGuidance?: string;
}

export type ThresholdLevel = "good" | "warn" | "bad" | "neutral";

export interface ThresholdResult {
  level: ThresholdLevel;
  label: string;
  hint: string;
}

const NEXT_STEP: Record<ThresholdLevel, string> = {
  good: "Keep stable",
  warn: "Investigate",
  bad: "Fix now",
  neutral: "Monitor",
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function inRange(value: number, rule: ThresholdRange): boolean {
  return value >= rule[0] && value <= rule[1];
}

function matchesCompare(value: number, rule: ThresholdCompare): boolean {
  if (rule.lte != null && value > rule.lte) return false;
  if (rule.gte != null && value < rule.gte) return false;
  return true;
}

function matchesRule(value: number, rule: ThresholdRange | ThresholdCompare): boolean {
  if (Array.isArray(rule)) return inRange(value, rule);
  return matchesCompare(value, rule);
}

export function evaluateMetric(
  value: unknown,
  rule: ThresholdRule | null | undefined
): ThresholdResult {
  const num = toNum(value);
  if (num === null || !rule) {
    return {
      level: "neutral",
      label: "N/A",
      hint: "No data or invalid value",
    };
  }

  const entries: Array<{ level: ThresholdLevel; rule: ThresholdRange | ThresholdCompare }> = [];
  if (rule.good) entries.push({ level: "good", rule: rule.good });
  if (rule.warn) entries.push({ level: "warn", rule: rule.warn });
  if (rule.bad) entries.push({ level: "bad", rule: rule.bad });

  for (const { level, rule: r } of entries) {
    if (matchesRule(num, r)) {
      const hint =
        level === "bad" && rule.badGuidance
          ? rule.badGuidance
          : NEXT_STEP[level];
      return {
        level,
        label: level.charAt(0).toUpperCase() + level.slice(1),
        hint,
      };
    }
  }

  return {
    level: "neutral",
    label: "Out of range",
    hint: NEXT_STEP.neutral,
  };
}

/** Format rule for display, e.g. "10–20" or "≤15" */
export function formatRuleForDisplay(rule: ThresholdRange | ThresholdCompare): string {
  if (Array.isArray(rule)) return `${rule[0]}–${rule[1]}`;
  if (rule.lte != null) return `≤${rule.lte}`;
  if (rule.gte != null) return `≥${rule.gte}`;
  return "—";
}
