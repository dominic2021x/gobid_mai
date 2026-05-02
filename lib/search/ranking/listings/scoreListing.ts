/**
 * Unified listing scoring: deterministic, configurable via RankingProfile.
 */

import type { ListingSearchFeatures } from "../../listings/types";
import type { ListingWeightSet } from "../core/types";

const TIER_ORDER_STEP = 0.15;
const TIER_ORDER_MIN_MULT = 0.3;

function tierMultiplier(tierOrder: number): number {
  return Math.max(TIER_ORDER_MIN_MULT, 1 - tierOrder * TIER_ORDER_STEP);
}

/**
 * Single scalar score from listing features and weight set.
 */
export function scoreListingUnified(
  features: ListingSearchFeatures,
  weights: ListingWeightSet,
  geoWeight: number = 1
): number {
  const geoComponent =
    features.countyExact * 0.4 +
    features.placeExact * 0.5 +
    features.sameParentArea * 0.3 +
    features.distanceScore * 0.2 +
    features.placeImportance * 0.1;

  const raw =
    features.textualRelevance * weights.textual +
    (features.categoryMatch + features.subcategoryMatch) * weights.category +
    geoComponent * weights.geo * geoWeight +
    features.freshness * weights.freshness +
    features.listingQuality * weights.quality +
    features.premiumBoost * weights.premium +
    features.engagement * weights.engagement;

  const mult = tierMultiplier(features.tierOrder);
  return Math.round(raw * mult * 10000) / 10000;
}
