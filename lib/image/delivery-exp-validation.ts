/** Clock skew tolerance (seconds) for HMAC `exp`. */
export const DELIVERY_EXP_CLOCK_SKEW_SEC = 120;

/** Reject tokens whose `exp` is absurdly far in the future (abuse / bad clocks). */
export const DELIVERY_EXP_MAX_FUTURE_SEC = 400 * 24 * 60 * 60; // ~400d (covers 365d TTL + slack)

/**
 * Validates Unix `exp` from signed URL. Call after parsing integer `exp`.
 */
export function validateDeliveryExp(exp: number, nowSec: number = Math.floor(Date.now() / 1000)): {
  ok: boolean;
  reason?: "expired" | "too_far_future" | "invalid";
} {
  if (!Number.isFinite(exp)) {
    return { ok: false, reason: "invalid" };
  }

  if (exp < nowSec - DELIVERY_EXP_CLOCK_SKEW_SEC) {
    return { ok: false, reason: "expired" };
  }

  if (exp > nowSec + DELIVERY_EXP_MAX_FUTURE_SEC) {
    return { ok: false, reason: "too_far_future" };
  }

  return { ok: true };
}
