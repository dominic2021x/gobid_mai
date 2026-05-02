/**
 * Unified search intelligence: default weights and limits.
 * Deterministic scoring; configurable via RankingProfile.
 */

/** Default suggestion weights (sum ~3–4; scale in score). */
export const DEFAULT_SUGGESTION_WEIGHTS = {
  lexical: 1.2,
  source: 0.15,
  frequency: 0.3,
  recency: 0.5,
  ctr: 0.8,
  quality: 0.5,
  context: 0.6,
  exploration: 0.25,
  qualityPenalty: 1,
  pattern: 0.7,
  queryAffinity: 0.6,
} as const;

/** Default listing weights. */
export const DEFAULT_LISTING_WEIGHTS = {
  textual: 1.5,
  category: 0.8,
  geo: 1.0,
  freshness: 0.6,
  quality: 0.7,
  premium: 0.3,
  engagement: 0.4,
  exploration: 0.2,
} as const;

/** Max candidates to fetch before rerank (serverless safe). */
export const CANDIDATE_CAP_SUGGESTIONS = 50;
export const CANDIDATE_CAP_LISTINGS = 200;

/** Top-K after rerank. */
export const TOP_K_SUGGESTIONS = 10;
export const TOP_K_LISTINGS = 30;

/** Exploration: boost when impressions below this. */
export const EXPLORATION_IMPRESSION_THRESHOLD = 20;

/** Recency half-life in days. */
export const RECENCY_HALF_DAYS = 90;

/** Freshness half-life for listings (days). */
export const FRESHNESS_HALF_DAYS = 30;

/** Min query length for suggest. */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;
