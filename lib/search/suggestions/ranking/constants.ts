/**
 * Ranking weights and thresholds (deterministic, tunable).
 * All weights are non-negative; final score = sum of weighted components.
 */

/** Lexical: exact match gets this bonus. */
export const LEXICAL_EXACT_WEIGHT = 3.0;

/** Lexical: prefix match base. */
export const LEXICAL_PREFIX_WEIGHT = 2.0;

/** Source priority from DB (scaled). */
export const SOURCE_PRIORITY_WEIGHT = 0.5;

/** Frequency count (log-scaled). */
export const FREQUENCY_WEIGHT = 0.3;

/** Recency from last_seen_at (days decay half-life). */
export const RECENCY_HALF_DAYS = 90;

/** CTR weight (clicks/impressions). */
export const CTR_WEIGHT = 4.0;

/** Precomputed quality_score from DB. */
export const QUALITY_SCORE_WEIGHT = 2.0;

/** Context match (category/channel). */
export const CONTEXT_BOOST_WEIGHT = 1.5;

/** Quality penalty (multiplier 0..1). */
export const QUALITY_PENALTY_WEIGHT = 1.0;

/** Exploration: boost for low-impression suggestions. */
export const EXPLORATION_BOOST_WEIGHT = 0.4;

/** Impressions below this get exploration boost. */
export const EXPLORATION_IMPRESSION_THRESHOLD = 50;

/** Phrase length: above this token count we apply penalty. */
export const PHRASE_LENGTH_PENALTY_THRESHOLD = 6;

/** Max phrase length penalty (multiplier). */
export const PHRASE_LENGTH_PENALTY_MAX = 0.5;

/** Very short query: min lexical relevance to avoid noise. */
export const MIN_QUERY_LENGTH_FOR_FUZZY = 2;

/** Default CTR when no stats. */
export const DEFAULT_CTR = 0.05;

/** Behavior suppression: impressions above this trigger penalty when clicks are zero or CTR very low. */
export const MIN_IMPRESSIONS_FOR_BEHAVIOR_PENALTY = 20;
/** Penalty multiplier when impressions >= threshold and clicks === 0. */
export const ZERO_CLICK_PENALTY = 0.25;
/** CTR below this (after sufficient impressions) gets penalty. */
export const LOW_CTR_THRESHOLD = 0.02;
/** Penalty multiplier when CTR < LOW_CTR_THRESHOLD and impressions >= threshold. */
export const LOW_CTR_PENALTY = 0.5;
