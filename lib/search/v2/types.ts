/** Types for AI Search Engine v2 */

export interface SearchCandidate {
  id: string;
  item: Record<string, unknown>;
  lexScore?: number;
  semScore?: number;
  graphScore?: number;
  freshnessScore?: number;
  score: number;
  category?: string;
  county?: string;
  /** Search intelligence: multiplicative boost from query boosts, clamped [0.8, 1.25] */
  queryBoostMultiplier?: number;
}

export interface IntentResult {
  intent: string;
  forcedFilters: Record<string, unknown>;
  categorySlug?: string | null;
  countySlug?: string | null;
}

export interface SearchFacets {
  category: Array<{ value: string; label?: string; count: number }>;
  county: Array<{ value: string; count: number }>;
}

export interface SearchMeta {
  cacheHit: boolean;
  totalCandidates?: number;
  timing?: Record<string, number>;
  impressionId?: string;
  bucket?: string;
  arm?: string;
  /** Soft autocorrect: "Did you mean X?" when no results and confidence high. */
  didYouMean?: string;
  /** True when results are from corrected-query fallback (original query in didYouMean). */
  correctedQueryUsed?: boolean;
}

export interface SearchV2Response {
  results: Record<string, unknown>[];
  facets: SearchFacets;
  suggestions: Array<{ text: string; score?: number }>;
  meta: SearchMeta;
}
