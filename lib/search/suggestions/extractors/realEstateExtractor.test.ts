/**
 * Unit tests for real-estate suggestion extractor.
 * Run: npx vitest run lib/search/suggestions/extractors/realEstateExtractor.test.ts
 */

import { describe, it, expect } from "vitest";
import { extractRealEstate } from "./realEstateExtractor";

describe("extractRealEstate", () => {
  it("extracts teren when word boundary present", () => {
    const out = extractRealEstate("Vand teren intravilan 500 mp");
    expect(out.some((c) => c.label === "teren")).toBe(true);
    expect(out.some((c) => c.label === "teren intravilan")).toBe(true);
  });

  it("extracts apartament and apartament N camere", () => {
    const out = extractRealEstate("Apartament 2 camere centru");
    expect(out.some((c) => c.label === "apartament")).toBe(true);
    expect(out.some((c) => c.label === "apartament 2 camere")).toBe(true);
  });

  it("extracts casa", () => {
    const out = extractRealEstate("Casa cu 3 camere");
    expect(out.some((c) => c.label === "casa")).toBe(true);
  });

  it("extracts spatiu comercial", () => {
    const out = extractRealEstate("Spațiu comercial 50 mp");
    expect(out.some((c) => c.label === "spatiu comercial")).toBe(true);
  });

  it("returns max 4 candidates", () => {
    const out = extractRealEstate("Teren extravilan apartament 3 camere casa spatiu comercial");
    expect(out.length).toBeLessThanOrEqual(4);
  });
});
