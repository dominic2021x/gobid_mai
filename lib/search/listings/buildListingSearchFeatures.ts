/**
 * Build ranking features for one listing candidate (text, category, geo, freshness, etc.).
 */

import type { ListingCandidateWithGeo, ListingSearchFeatures, GeoRankContext } from "./types";
import { geoRankScore } from "../geo/geoRankScore";

const FRESHNESS_HALF_DAYS = 30;
const PREMIUM_BOOST = 0.3;

function freshnessScore(createdAt: string | null): number {
  if (!createdAt) return 0.5;
  const days = (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.exp(-(days * Math.LN2) / FRESHNESS_HALF_DAYS);
}

export function buildListingSearchFeatures(
  candidate: ListingCandidateWithGeo,
  context: {
    queryNorm: string;
    categorySlug: string | null;
    subcategorySlug: string | null;
    geo: GeoRankContext | null;
    baseScore?: number;
  }
): ListingSearchFeatures {
  const item = candidate.item;
  const geo = candidate.geo ?? null;
  const geoContext: GeoRankContext = context.geo ?? {
    countyId: null,
    placeId: null,
    tiers: [],
  };
  const geoResult = geoRankScore(geo, geoContext, 0.5, null, null);

  const category = String(item?.category ?? "").toLowerCase();
  const subcategory = String(item?.subcategory ?? "").toLowerCase();
  const categoryMatch = context.categorySlug && category.includes(context.categorySlug) ? 1 : 0;
  const subcategoryMatch = context.subcategorySlug && subcategory.includes(context.subcategorySlug) ? 1 : 0;

  const textualRelevance = Math.min(1, (context.baseScore ?? 0) / 10);
  const premiumBoost = (item?.is_premium ?? item?.premium_until) ? PREMIUM_BOOST : 0;
  const fresh = freshnessScore((item?.created_at as string) ?? null);
  const listingQuality = geo?.geo_quality === "exact" ? 0.2 : geo?.geo_quality === "inferred" ? 0.1 : 0;

  return {
    textualRelevance,
    categoryMatch,
    subcategoryMatch,
    countyExact: geoResult.countyExact,
    placeExact: geoResult.placeExact,
    sameParentArea: geoResult.sameParentArea,
    distanceScore: geoResult.distanceScore,
    placeImportance: geoResult.placeImportance,
    premiumBoost,
    freshness: fresh,
    engagement: 0,
    listingQuality,
    tierOrder: candidate.tierOrder,
  };
}
