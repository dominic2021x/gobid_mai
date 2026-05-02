/**
 * Run: npx vitest run lib/image/delivery-ttl.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  clampDeliveryTtlSeconds,
  DELIVERY_MAX_SIGNED_TTL_SEC,
  DELIVERY_MIN_SIGNED_TTL_SEC,
  wasDeliveryTtlClamped,
} from "./delivery-ttl";

describe("clampDeliveryTtlSeconds + wasDeliveryTtlClamped", () => {
  it("clamps below minimum and reports clamped", () => {
    const applied = clampDeliveryTtlSeconds(60);
    expect(applied).toBe(DELIVERY_MIN_SIGNED_TTL_SEC);
    expect(wasDeliveryTtlClamped(60, applied)).toBe(true);
  });

  it("clamps above maximum", () => {
    const applied = clampDeliveryTtlSeconds(DELIVERY_MAX_SIGNED_TTL_SEC + 9999);
    expect(applied).toBe(DELIVERY_MAX_SIGNED_TTL_SEC);
    expect(wasDeliveryTtlClamped(DELIVERY_MAX_SIGNED_TTL_SEC + 9999, applied)).toBe(true);
  });

  it("does not flag in-range integer TTL", () => {
    const requested = 3600;
    const applied = clampDeliveryTtlSeconds(requested);
    expect(applied).toBe(3600);
    expect(wasDeliveryTtlClamped(requested, applied)).toBe(false);
  });

  it("flags invalid input as clamped", () => {
    const applied = clampDeliveryTtlSeconds(NaN);
    expect(applied).toBe(DELIVERY_MIN_SIGNED_TTL_SEC);
    expect(wasDeliveryTtlClamped(NaN, applied)).toBe(true);
  });
});
