/**
 * Unified listing reranking: build features, score with profile, sort, top-K.
 */

import type { ListingCandidateWithGeo, RankedListingResult, ListingSearchFeatures } from "../../listings/types";
import type { GeoRankContext } from "../../listings/types";
import type { RankingProfile } from "../core/types";
import { buildListingSearchFeatures } from "../../listings/buildListingSearchFeatures";
import { scoreListingUnified } from "./scoreListing";
import { CANDIDATE_CAP_LISTINGS, TOP_K_LISTINGS } from "../core/constants";

/**
 * Rerank listing candidates with unified profile weights.
 */
export function rerankListingsUnified(
  candidates: ListingCandidateWithGeo[],
  context: {
    queryNorm: string;
    categorySlug: string | null;
    subcategorySlug: string | null;
    geo: GeoRankContext | null;
  },
  profile: RankingProfile,
  topK: number = TOP_K_LISTINGS
): RankedListingResult[] {
  if (candidates.length === 0) return [];

  const geoContext: GeoRankContext | null = profile.useGeoTiering ? context.geo : null;
  const capped = candidates.slice(0, CANDIDATE_CAP_LISTINGS);

  const ranked: RankedListingResult[] = capped.map((c) => {
    const features = buildListingSearchFeatures(c, {
      queryNorm: context.queryNorm,
      categorySlug: context.categorySlug,
      subcategorySlug: context.subcategorySlug,
      geo: geoContext,
      baseScore: c.baseScore,
    });
    const finalScore = scoreListingUnified(
      features,
      profile.listingWeights,
      profile.geoWeight
    );
    return { ...c, features, finalScore };
  });

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked.slice(0, topK);
}
