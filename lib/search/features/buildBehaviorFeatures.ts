/**
 * Behavior features: CTR, impressions, recency, saves.
 * Used by both suggestion and listing ranking.
 */

import type { BehaviorFeatures } from "../ranking/core/types";
import { RECENCY_HALF_DAYS } from "../ranking/core/constants";

const SMOOTH_IMPRESSIONS = 2;
const SMOOTH_CLICKS = 0.5;

export function buildBehaviorFeaturesFromStats(
  impressions: number,
  clicks: number,
  lastSeenAt: string | null,
  savedCount: number = 0
): BehaviorFeatures {
  const ctr =
    impressions + SMOOTH_IMPRESSIONS > 0
      ? (clicks + SMOOTH_CLICKS) / (impressions + SMOOTH_IMPRESSIONS)
      : 0.1;
  const recency = lastSeenAt
    ? Math.exp(
        (-(Date.now() - new Date(lastSeenAt).getTime()) / (24 * 60 * 60 * 1000)) *
          Math.LN2 /
          RECENCY_HALF_DAYS
      )
    : 0.2;

  return {
    impressions,
    clicks,
    ctr: Math.min(1, ctr),
    recency: Math.min(1, recency),
    savedCount,
  };
}

/** For listing: engagement from listing-level stats (clicks, saves). */
export function buildBehaviorFeaturesForListing(
  listingStats: { impressions?: number; clicks?: number; saved_count?: number } | null,
  updatedAt: string | null
): BehaviorFeatures {
  const impressions = listingStats?.impressions ?? 0;
  const clicks = listingStats?.clicks ?? 0;
  const savedCount = listingStats?.saved_count ?? 0;
  return buildBehaviorFeaturesFromStats(impressions, clicks, updatedAt, savedCount);
}
