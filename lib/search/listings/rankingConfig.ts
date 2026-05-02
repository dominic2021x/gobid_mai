/**
 * Configurable weights for listing search ranking (geo, category, premium, freshness, etc.).
 * Tune here for production; no code changes needed in scoring logic.
 */

export const LISTING_RANK_WEIGHTS = {
  textualRelevance: 3.0,
  categoryMatch: 1.5,
  subcategoryMatch: 1.2,
  countyExact: 2.0,
  placeExact: 3.0,
  sameParentArea: 1.2,
  distanceScore: 1.0,
  placeImportance: 0.5,
  premiumBoost: 0.4,
  freshness: 0.6,
  engagement: 0.3,
  listingQuality: 0.3,
  tierOrder: 2.0,
} as const;

/** Tier multiplier: higher tierOrder = lower priority; 0.15 per tier step. */
export const TIER_ORDER_STEP = 0.15;

/** Minimum multiplier for lowest-priority tier (avoid zero). */
export const TIER_ORDER_MIN_MULT = 0.1;
