/**
 * Compute final ranking score from features (deterministic).
 * Single candidate; used by rerankSuggestions for each candidate.
 */

import type { SuggestionFeatures } from "./types";
import {
  LEXICAL_EXACT_WEIGHT,
  LEXICAL_PREFIX_WEIGHT,
  SOURCE_PRIORITY_WEIGHT,
  FREQUENCY_WEIGHT,
  CTR_WEIGHT,
  QUALITY_SCORE_WEIGHT,
  CONTEXT_BOOST_WEIGHT,
  QUALITY_PENALTY_WEIGHT,
  EXPLORATION_BOOST_WEIGHT,
} from "./constants";

function log1pScale(x: number): number {
  return Math.log1p(Math.max(0, x));
}

/**
 * Single scalar score from features. Higher = better.
 * Weights are applied linearly; frequency is log-scaled.
 */
export function scoreSuggestion(features: SuggestionFeatures): number {
  const lexical =
    features.lexical_relevance >= 1
      ? LEXICAL_EXACT_WEIGHT
      : features.lexical_relevance >= 0.5
        ? LEXICAL_PREFIX_WEIGHT * features.lexical_relevance
        : features.lexical_relevance * 1.5;

  const lengthMult = features.phrase_length_penalty;
  const source = SOURCE_PRIORITY_WEIGHT * features.source_priority;
  const freq = FREQUENCY_WEIGHT * Math.min(20, log1pScale(features.frequency_count));
  const recency = 0.5 * features.recency;
  const ctr = CTR_WEIGHT * Math.min(1, features.ctr);
  const quality = QUALITY_SCORE_WEIGHT * features.quality_score;
  const context = CONTEXT_BOOST_WEIGHT * features.context_boost;
  const penalty = QUALITY_PENALTY_WEIGHT * features.quality_penalty;
  const exploration = EXPLORATION_BOOST_WEIGHT * features.exploration_boost;

  const raw =
    (lexical + source + freq + recency + ctr + quality + context + exploration) * lengthMult * penalty;
  return Math.round(raw * 10000) / 10000;
}
