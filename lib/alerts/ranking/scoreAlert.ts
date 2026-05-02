/**
 * Score alert candidates using deterministic weights.
 * Higher score = more likely to get clicked (CTR).
 */

import type { AlertFeatures } from "./features";

export const WEIGHTS = {
  /** Fresher listings score higher; decay over ~72h */
  w_fresh: 0.25,
  /** Bonus when listing county matches search filter */
  w_same_county: 0.2,
  /** Bonus when listing category matches search filter */
  w_same_category: 0.1,
  /** Query's historical CTR (0-1) */
  w_ctr: 0.2,
  /** Query's long-click rate (engagement signal) */
  w_long_click: 0.1,
  /** Penalty for pogo (bounce) rate */
  w_pogo_penalty: -0.15,
  /** User profile category alignment */
  w_user_category: 0.05,
  /** User profile county alignment */
  w_user_county: 0.05,
} as const;

export const SCORE_THRESHOLD = 0.15;

function freshnessScore(hours: number): number {
  if (hours <= 0) return 1;
  const decay = Math.exp(-hours / 72);
  return Math.max(0, decay);
}

export function scoreAlert(features: AlertFeatures): number {
  const f = freshnessScore(features.fresh_hours);
  const sameCounty = features.same_county ? 1 : 0;
  const sameCategory = features.same_category ? 1 : 0;
  const pogo = 1 - features.pogo_penalty;

  return (
    WEIGHTS.w_fresh * f +
    WEIGHTS.w_same_county * sameCounty +
    WEIGHTS.w_same_category * sameCategory +
    WEIGHTS.w_ctr * features.ctr_7d +
    WEIGHTS.w_long_click * features.long_click_rate +
    WEIGHTS.w_pogo_penalty * features.pogo_penalty +
    WEIGHTS.w_user_category * features.user_category_match +
    WEIGHTS.w_user_county * features.user_county_match
  );
}

export function getWhyTags(features: AlertFeatures): string[] {
  const tags: string[] = [];
  if (features.fresh_hours < 24) tags.push("fresh");
  if (features.same_county) tags.push("same_county");
  if (features.same_category) tags.push("same_category");
  if (features.user_county_match > 0) tags.push("your_county");
  if (features.user_category_match > 0) tags.push("your_category");
  if (features.ctr_7d > 0.05) tags.push("popular_query");
  if (features.long_click_rate > 0.1) tags.push("engaging");
  return tags;
}
