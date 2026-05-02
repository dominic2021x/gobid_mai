/**
 * Signed URL lifetime bounds (seconds). Applied when minting links (`buildSignedDeliveryUrls`).
 */
export const DELIVERY_MIN_SIGNED_TTL_SEC = 5 * 60; // 5 minutes — avoids “flash expired” links
export const DELIVERY_MAX_SIGNED_TTL_SEC = 366 * 24 * 60 * 60; // ≤ 1 year + leap slack

export function clampDeliveryTtlSeconds(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    return DELIVERY_MIN_SIGNED_TTL_SEC;
  }
  return Math.min(
    Math.max(Math.floor(requested), DELIVERY_MIN_SIGNED_TTL_SEC),
    DELIVERY_MAX_SIGNED_TTL_SEC
  );
}

/** True when the requested TTL was not already within [min,max] as an integer second value. */
export function wasDeliveryTtlClamped(requested: number, applied: number): boolean {
  if (!Number.isFinite(requested) || requested <= 0) return true;
  return Math.floor(requested) !== applied;
}
