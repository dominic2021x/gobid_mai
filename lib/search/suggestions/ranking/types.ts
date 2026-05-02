/**
 * Types for suggestion ranking (deterministic, no ML).
 * Candidate = one row from DB; RankedCandidate = with features + final score.
 */

export type SuggestionCandidate = {
  id: string;
  phrase: string;
  phrase_norm: string;
  kind: string;
  popularity: number;
  meta: Record<string, unknown>;
  source_priority: number;
  frequency_count: number;
  last_seen_at: string | null;
  quality_score: number;
  rank_score: number;
  channel: string | null;
  category_key: string | null;
};

/** Features computed for one candidate (input to scoring). */
export type SuggestionFeatures = {
  /** 1 = exact match, 0.5+ = prefix, 0 = fuzzy. */
  lexical_relevance: number;
  /** Penalty for very long phrases (prefer concise). */
  phrase_length_penalty: number;
  /** From DB (higher = prefer this source). */
  source_priority: number;
  /** From DB (listing frequency). */
  frequency_count: number;
  /** Recency: 0..1 from last_seen_at (newer = higher). */
  recency: number;
  /** From daily_stats: clicks / impressions, or 0. */
  ctr: number;
  /** From DB (precomputed quality 0..1). */
  quality_score: number;
  /** Context match: request category/channel matches suggestion. */
  context_boost: number;
  /** Low quality / spam penalty 0..1 (1 = no penalty). */
  quality_penalty: number;
  /** Slight boost for suggestions with few impressions (exploration). */
  exploration_boost: number;
  /** Impressions count from stats (for exploration). */
  impressions: number;
  /** Pattern engine quality 0..1 (structure, vertical match). */
  pattern_quality: number;
  /** Query-to-suggestion affinity 0..1 (CTR for this query prefix). */
  query_affinity: number;
};

/** Candidate plus features and final score (for sorting). */
export type RankedSuggestion = SuggestionCandidate & {
  features: SuggestionFeatures;
  final_score: number;
};

export type RankingContext = {
  query_norm: string;
  category?: string | null;
  subcategory?: string | null;
  county?: string | null;
  city?: string | null;
  channel?: string | null;
};
