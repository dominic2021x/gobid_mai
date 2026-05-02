/**
 * Geo features for ranking (suggestions with geo meta, listings with listing_geo).
 */

import type { GeoFeatures } from "../ranking/core/types";
import type { GeoRankContext } from "../listings/types";
import type { ListingGeoRow } from "../listings/types";
import { geoRankScore } from "../geo/geoRankScore";

/**
 * Build geo features for a listing (has listing_geo row).
 */
export function buildGeoFeaturesForListing(
  geo: ListingGeoRow | null,
  context: GeoRankContext | null,
  tierOrder: number
): GeoFeatures {
  if (!context) {
    return {
      countyMatch: 0,
      placeMatch: 0,
      distanceScore: 0,
      placeImportance: 0,
      tierOrder,
    };
  }
  const result = geoRankScore(geo, context, 0.5, null, null);
  return {
    countyMatch: result.countyExact,
    placeMatch: result.placeExact,
    distanceScore: result.distanceScore,
    placeImportance: result.placeImportance,
    tierOrder,
  };
}

/**
 * Build geo features for a suggestion (when suggestion has county/city in meta or phrase).
 * Simplified: no distance; we only have match flags if we parse phrase for location.
 */
export function buildGeoFeaturesForSuggestion(
  _phraseNorm: string,
  _meta: Record<string, unknown> | null,
  contextCounty: string | null,
  contextCity: string | null
): GeoFeatures {
  // Suggestion geo: could be from category_key or meta.county/meta.city; for now minimal.
  const countyMatch = contextCounty ? 0.5 : 0; // would need suggestion county/city to compare
  const placeMatch = contextCity ? 0.5 : 0;
  return {
    countyMatch,
    placeMatch,
    distanceScore: 0,
    placeImportance: 0,
    tierOrder: 0,
  };
}
