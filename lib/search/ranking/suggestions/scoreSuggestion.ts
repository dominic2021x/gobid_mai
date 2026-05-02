/**
 * Unified suggestion scoring: deterministic, configurable via RankingProfile.
 * Uses same feature shape as existing SuggestionFeatures; weights from profile.
 */

import type { SuggestionFeatures } from "../../suggestions/ranking/types";
import type { SuggestionWeightSet } from "../core/types";

function log1pScale(x: number): number {
  return Math.log1p(Math.max(0, x));
}

/**
 * Single scalar score from features and weight set.
 */
export function scoreSuggestionUnified(
  features: SuggestionFeatures,
  weights: SuggestionWeightSet
): number {
  const lexical =
    features.lexical_relevance >= 1
      ? 1
      : features.lexical_relevance >= 0.5
        ? features.lexical_relevance
        : features.lexical_relevance * 0.8;

  const lengthMult = features.phrase_length_penalty;
  const source = Math.min(10, Math.max(0, features.source_priority)) / 10;
  const freq = Math.min(20, log1pScale(features.frequency_count)) / 20;
  const ctr = Math.min(1, features.ctr);
  const quality = Math.min(1, features.quality_score);
  const penalty = features.quality_penalty;

  const pattern = Math.min(1, features.pattern_quality ?? 0.5);
  const queryAff = Math.min(1, features.query_affinity ?? 0.5);
  const raw =
    lexical * weights.lexical +
    source * weights.source +
    freq * weights.frequency +
    features.recency * weights.recency +
    ctr * weights.ctr +
    quality * weights.quality +
    features.context_boost * weights.context +
    features.exploration_boost * weights.exploration +
    pattern * (weights.pattern ?? 0) +
    queryAff * (weights.queryAffinity ?? 0);

  return Math.round(raw * lengthMult * penalty * 10000) / 10000;
}
