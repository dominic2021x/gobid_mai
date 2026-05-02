/**
 * Score one listing from features (deterministic).
 */

import type { ListingSearchFeatures } from "./types";
import { LISTING_RANK_WEIGHTS, TIER_ORDER_STEP, TIER_ORDER_MIN_MULT } from "./rankingConfig";

/**
 * Higher tierOrder = lower priority; we subtract so lower tier order = higher score.
 */
function tierMultiplier(tierOrder: number): number {
  return Math.max(TIER_ORDER_MIN_MULT, 1 - tierOrder * TIER_ORDER_STEP);
}

export function scoreListingResult(features: ListingSearchFeatures): number {
  const w = LISTING_RANK_WEIGHTS;
  const raw =
    features.textualRelevance * w.textualRelevance +
    features.categoryMatch * w.categoryMatch +
    features.subcategoryMatch * w.subcategoryMatch +
    features.countyExact * w.countyExact +
    features.placeExact * w.placeExact +
    features.sameParentArea * w.sameParentArea +
    features.distanceScore * w.distanceScore +
    features.placeImportance * w.placeImportance +
    features.premiumBoost * w.premiumBoost +
    features.freshness * w.freshness +
    features.engagement * w.engagement +
    features.listingQuality * w.listingQuality;
  const mult = tierMultiplier(features.tierOrder);
  return Math.round((raw * mult) * 10000) / 10000;
}
