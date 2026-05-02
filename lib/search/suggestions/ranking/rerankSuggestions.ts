/**
 * Rerank suggestion candidates using features + score.
 * Fetches no data; receives candidates and optional stats map.
 */

import type { SuggestionCandidate, RankedSuggestion, RankingContext } from "./types";
import { buildSuggestionFeatures } from "./buildSuggestionFeatures";
import { scoreSuggestion } from "./scoreSuggestion";

export type StatsMap = Map<string, { impressions: number; clicks: number }>;

/**
 * Rerank candidates: build features, score, sort by final_score desc.
 * statsMap: suggestion_id -> { impressions, clicks } (from daily_stats or empty).
 */
export function rerankSuggestions(
  candidates: SuggestionCandidate[],
  context: RankingContext,
  statsMap?: StatsMap | null,
  topK: number = 10
): RankedSuggestion[] {
  if (candidates.length === 0) return [];

  const ranked: RankedSuggestion[] = candidates.map((c) => {
    const stats = statsMap?.get(c.id);
    const features = buildSuggestionFeatures(c, context, stats ?? undefined);
    const final_score = scoreSuggestion(features);
    return { ...c, features, final_score };
  });

  ranked.sort((a, b) => b.final_score - a.final_score);
  return ranked.slice(0, topK);
}
