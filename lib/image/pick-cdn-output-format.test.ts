/**
 * Accept normalization + deterministic format selection.
 * Run: npx vitest run lib/image/pick-cdn-output-format.test.ts
 */

import { describe, it, expect } from "vitest";
import { normalizeAcceptHeader, pickCdnOutputFormatFromAccept } from "./pick-cdn-output-format";

describe("normalizeAcceptHeader", () => {
  it("returns null for null/undefined/blank", () => {
    expect(normalizeAcceptHeader(null)).toBeNull();
    expect(normalizeAcceptHeader(undefined)).toBeNull();
    expect(normalizeAcceptHeader("   ")).toBeNull();
    expect(normalizeAcceptHeader(",,,")).toBeNull();
  });

  it("trims parts and collapses internal whitespace", () => {
    expect(normalizeAcceptHeader("  image/avif  ,  image/webp  ")).toBe("image/avif, image/webp");
    expect(normalizeAcceptHeader("image/avif;q=0.8,\timage/webp")).toBe("image/avif;q=0.8, image/webp");
  });
});

describe("pickCdnOutputFormatFromAccept", () => {
  it("defaults to jpeg when Accept missing or empty after normalize", () => {
    expect(pickCdnOutputFormatFromAccept(null)).toBe("jpeg");
    expect(pickCdnOutputFormatFromAccept("")).toBe("jpeg");
    expect(pickCdnOutputFormatFromAccept("   ")).toBe("jpeg");
  });

  it("prefers avif when listed with q>0", () => {
    expect(pickCdnOutputFormatFromAccept("image/avif,image/webp,image/jpeg")).toBe("avif");
    expect(pickCdnOutputFormatFromAccept("image/webp;q=0.5, image/avif;q=0.9")).toBe("avif");
  });

  it("respects q=0 to skip a format", () => {
    expect(pickCdnOutputFormatFromAccept("image/avif;q=0, image/webp")).toBe("webp");
  });

  it("uses webp before jpeg when both accepted", () => {
    expect(pickCdnOutputFormatFromAccept("image/webp, image/jpeg")).toBe("webp");
  });

  it("maps image/* and */* to webp (same as app policy)", () => {
    expect(pickCdnOutputFormatFromAccept("image/*")).toBe("webp");
    expect(pickCdnOutputFormatFromAccept("*/*")).toBe("webp");
  });

  it("falls through to jpeg when no recognizable image types", () => {
    expect(pickCdnOutputFormatFromAccept("text/html")).toBe("jpeg");
  });
});
