/**
 * Unit tests for auto (brand + model) suggestion extractor.
 * Run: npx vitest run lib/search/suggestions/extractors/autoExtractor.test.ts
 */

import { describe, it, expect } from "vitest";
import { extractAuto } from "./autoExtractor";

describe("extractAuto", () => {
  it("extracts brand only", () => {
    const out = extractAuto("Jaguar XE 2019");
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].label).toBe("Jaguar");
    expect(out[0].entity_type).toBe("auto");
  });

  it("extracts brand + model", () => {
    const out = extractAuto("Jaguar F-PACE diesel");
    expect(out.some((c) => c.label.startsWith("Jaguar ") && c.label.length > 6)).toBe(true);
  });

  it("returns empty for no brand", () => {
    const out = extractAuto("Random produs fara marca");
    expect(out).toHaveLength(0);
  });

  it("ignores year in model", () => {
    const out = extractAuto("BMW Seria 3 2020");
    expect(out.some((c) => c.label === "Bmw")).toBe(true);
  });

  it("extracts only Jaguar xj (no engine/spec like 3996 cmc)", () => {
    const out = extractAuto("Jaguar xj 3996 cmc");
    expect(out.map((c) => c.label)).toContain("Jaguar");
    const withModel = out.find((c) => c.label.startsWith("Jaguar ") && c.label !== "Jaguar");
    expect(withModel?.label).toBe("Jaguar xj");
  });

  it("extracts only Jaguar f-pace (no suv-ul lux)", () => {
    const out = extractAuto("Jaguar f-pace suv-ul lux");
    expect(out.map((c) => c.label)).toContain("Jaguar");
    const withModel = out.find((c) => c.label.startsWith("Jaguar ") && c.label !== "Jaguar");
    expect(withModel?.label).toBe("Jaguar f-pace");
  });
});
