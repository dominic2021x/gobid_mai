/**
 * Unified suggestion reranking: build features, score with profile, sort, top-K.
 * Uses pattern engine for pattern_quality; applies behavior suppression via quality_penalty.
 */

import type { SuggestionCandidate, RankedSuggestion, RankingContext } from "../../suggestions/ranking/types";
import type { RankingProfile } from "../core/types";
import type { MarketplaceTaxonomy } from "@/lib/search/patterns/types";
import type { PatternProfile } from "@/lib/search/patterns/types";
import { buildSuggestionFeatures } from "../../suggestions/ranking/buildSuggestionFeatures";
import { scoreSuggestionUnified } from "./scoreSuggestion";
import { CANDIDATE_CAP_SUGGESTIONS, TOP_K_SUGGESTIONS } from "../core/constants";
import { buildMarketplaceTaxonomy } from "@/lib/search/patterns/buildMarketplaceTaxonomy";
import { getProfileForSubcategory } from "@/lib/search/patterns/profiles/getProfileForSubcategory";
import { matchPatternProfile } from "@/lib/search/patterns/matchPatternProfile";
import { scorePatternQuality } from "@/lib/search/patterns/scorePatternQuality";

export type StatsMap = Map<string, { impressions: number; clicks: number }>;
export type QueryAffinityMap = Map<string, { impressions: number; clicks: number }>;

/**
 * Rerank suggestion candidates with unified profile weights.
 * When taxonomy/patternProfile are provided (e.g. from cached load), they are reused; otherwise built in-memory.
 * statsMap = behavior-based quality_penalty. queryAffinityMap = per-query CTR for affinity boost.
 */
export function rerankSuggestionsUnified(
  candidates: SuggestionCandidate[],
  context: RankingContext,
  profile: RankingProfile,
  statsMap?: StatsMap | null,
  topK: number = TOP_K_SUGGESTIONS,
  taxonomy?: MarketplaceTaxonomy | null,
  patternProfile?: PatternProfile | null,
  queryAffinityMap?: QueryAffinityMap | null
): RankedSuggestion[] {
  if (candidates.length === 0) return [];

  const tax = taxonomy ?? buildMarketplaceTaxonomy();
  const patProfile =
    patternProfile ?? getProfileForSubcategory(context.category ?? null, context.subcategory ?? null);

  const capped = candidates.slice(0, CANDIDATE_CAP_SUGGESTIONS);
  const ranked: RankedSuggestion[] = capped.map((c) => {
    const match = matchPatternProfile(c.phrase_norm, { taxonomy: tax, profile: patProfile });
    const patternQuality = scorePatternQuality(match, patProfile);
    const stats = statsMap?.get(c.id);
    const queryStats = queryAffinityMap?.get(c.id);
    const features = buildSuggestionFeatures(
      c,
      context,
      stats ?? undefined,
      patternQuality,
      queryStats ?? undefined
    );
    const final_score = scoreSuggestionUnified(features, profile.suggestionWeights);
    return { ...c, features, final_score };
  });

  ranked.sort((a, b) => b.final_score - a.final_score);
  return ranked.slice(0, topK);
}
