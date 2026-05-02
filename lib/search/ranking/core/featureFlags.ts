/**
 * Feature flags for unified search intelligence rollout.
 * Phase 1: telemetry + shared features
 * Phase 2: suggestion + search unified scoring
 * Phase 3: refinements + quality scores
 * Phase 4: advanced behavioral tuning
 */

export type SearchIntelligencePhase = 1 | 2 | 3 | 4;

const phaseFromEnv = (): SearchIntelligencePhase => {
  const v = process.env.SEARCH_INTELLIGENCE_PHASE;
  if (v === "1" || v === "2" || v === "3" || v === "4") return Number(v) as SearchIntelligencePhase;
  return 2; // default: unified scoring on
};

let cachedPhase: SearchIntelligencePhase | null = null;

export function getSearchIntelligencePhase(): SearchIntelligencePhase {
  if (cachedPhase !== null) return cachedPhase;
  cachedPhase = phaseFromEnv();
  return cachedPhase;
}

/** Phase 1: telemetry + shared feature builders in use. */
export function isTelemetryAndFeaturesEnabled(): boolean {
  return getSearchIntelligencePhase() >= 1;
}

/** Phase 2: unified suggestion + listing scoring (rerank in TS). */
export function isUnifiedScoringEnabled(): boolean {
  return getSearchIntelligencePhase() >= 2;
}

/** Phase 3: refinements + listing/seller quality scores. */
export function isRefinementsAndQualityEnabled(): boolean {
  return getSearchIntelligencePhase() >= 3;
}

/** Phase 4: advanced behavioral tuning (exploration, personalization). */
export function isAdvancedBehaviorEnabled(): boolean {
  return getSearchIntelligencePhase() >= 4;
}

/** Use new search_query_* stats tables when available. */
export function useQueryStatsTables(): boolean {
  return getSearchIntelligencePhase() >= 2 && process.env.USE_SEARCH_QUERY_STATS === "true";
}
