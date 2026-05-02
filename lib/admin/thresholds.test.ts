import { describe, it, expect } from "vitest";
import {
  evaluateMetric,
  formatRuleForDisplay,
  type ThresholdRule,
} from "./thresholds";

describe("evaluateMetric", () => {
  it("returns neutral for null/undefined value", () => {
    expect(evaluateMetric(null, { good: [0, 100] })).toEqual({
      level: "neutral",
      label: "N/A",
      hint: "No data or invalid value",
    });
    expect(evaluateMetric(undefined, { good: [0, 100] })).toEqual({
      level: "neutral",
      label: "N/A",
      hint: "No data or invalid value",
    });
  });

  it("returns neutral for invalid value", () => {
    expect(evaluateMetric("abc", { good: [0, 100] })).toEqual({
      level: "neutral",
      label: "N/A",
      hint: "No data or invalid value",
    });
  });

  it("supports range rules: 10-20 green, 21-30 amber, >30 red", () => {
    const rule: ThresholdRule = {
      good: [10, 20],
      warn: [21, 30],
      bad: [31, 1000],
    };

    expect(evaluateMetric(15, rule).level).toBe("good");
    expect(evaluateMetric(25, rule).level).toBe("warn");
    expect(evaluateMetric(35, rule).level).toBe("bad");
    expect(evaluateMetric(5, rule).level).toBe("neutral");
  });

  it("supports value <= 15 is green (lte)", () => {
    const rule: ThresholdRule = {
      good: { lte: 15 },
      warn: { gte: 16, lte: 30 },
      bad: { gte: 31 },
    };

    expect(evaluateMetric(10, rule).level).toBe("good");
    expect(evaluateMetric(15, rule).level).toBe("good");
    expect(evaluateMetric(20, rule).level).toBe("warn");
    expect(evaluateMetric(35, rule).level).toBe("bad");
  });

  it("returns badGuidance when bad and badGuidance set", () => {
    const rule: ThresholdRule = {
      good: [0, 50],
      bad: [51, 200],
      badGuidance: "Reduce latency by optimizing cache",
    };

    const r = evaluateMetric(100, rule);
    expect(r.level).toBe("bad");
    expect(r.hint).toBe("Reduce latency by optimizing cache");
  });

  it("returns default hint when no badGuidance", () => {
    const rule: ThresholdRule = {
      bad: [51, 200],
    };

    const r = evaluateMetric(100, rule);
    expect(r.level).toBe("bad");
    expect(r.hint).toBe("Fix now");
  });

  it("parses string numbers", () => {
    const rule: ThresholdRule = { good: [10, 20] };
    expect(evaluateMetric("15", rule).level).toBe("good");
    expect(evaluateMetric("25", rule).level).toBe("neutral");
  });
});

describe("formatRuleForDisplay", () => {
  it("formats range as min–max", () => {
    expect(formatRuleForDisplay([10, 20])).toBe("10–20");
  });

  it("formats lte", () => {
    expect(formatRuleForDisplay({ lte: 15 })).toBe("≤15");
  });

  it("formats gte", () => {
    expect(formatRuleForDisplay({ gte: 80 })).toBe("≥80");
  });
});
