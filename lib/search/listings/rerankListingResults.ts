/**
 * Rerank listing candidates with geo and listing features.
 */

import type { ListingCandidateWithGeo, RankedListingResult, GeoRankContext } from "./types";
import { buildListingSearchFeatures } from "./buildListingSearchFeatures";
import { scoreListingResult } from "./scoreListingResult";

export function rerankListingResults(
  candidates: ListingCandidateWithGeo[],
  context: {
    queryNorm: string;
    categorySlug: string | null;
    subcategorySlug: string | null;
    geo: GeoRankContext | null;
    baseScores?: Map<string, number>;
  },
  topK: number = 50
): RankedListingResult[] {
  const ranked: RankedListingResult[] = candidates.map((c) => {
    const baseScore = context.baseScores?.get(c.id);
    const features = buildListingSearchFeatures(c, {
      ...context,
      baseScore,
    });
    const finalScore = scoreListingResult(features);
    return { ...c, features, finalScore };
  });
  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked.slice(0, topK);
}
