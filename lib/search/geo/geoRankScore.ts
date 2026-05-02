/**
 * Geo contribution to listing rank: exact match, same county, same parent, distance, importance.
 */

import type { ListingGeoRow } from "../listings/types";
import type { GeoRankContext } from "../listings/types";
import { GEO_RANK_WEIGHTS, GEO_MAX_KM_FOR_DISTANCE } from "./constants";

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Compute geo score for one listing given its listing_geo row and context.
 */
export function geoRankScore(
  listingGeo: ListingGeoRow | null,
  context: GeoRankContext,
  placeImportance: number = 0.5,
  targetLat?: number | null,
  targetLng?: number | null
): {
  countyExact: number;
  placeExact: number;
  sameParentArea: number;
  distanceScore: number;
  placeImportance: number;
  total: number;
} {
  if (!listingGeo) {
    return {
      countyExact: 0,
      placeExact: 0,
      sameParentArea: 0,
      distanceScore: 0,
      placeImportance: 0,
      total: 0,
    };
  }

  let countyExact = 0;
  if (context.countyId && listingGeo.county_id === context.countyId) {
    countyExact = 1;
  }

  let placeExact = 0;
  if (context.placeId && listingGeo.place_id === context.placeId) {
    placeExact = 1;
  }

  let sameParentArea = 0;
  if (context.placeId && listingGeo.parent_place_id === context.placeId) {
    sameParentArea = 1;
  } else if (context.placeId && listingGeo.place_id && context.tiers.some((t) => t.placeIds.includes(listingGeo!.place_id!))) {
    sameParentArea = 0.5;
  }

  let distanceScore = 0;
  if (
    targetLat != null &&
    targetLng != null &&
    listingGeo.lat != null &&
    listingGeo.lng != null
  ) {
    const km = haversineKm(targetLat, targetLng, listingGeo.lat, listingGeo.lng);
    distanceScore = Math.max(0, 1 - km / GEO_MAX_KM_FOR_DISTANCE);
  }

  const total =
    countyExact * GEO_RANK_WEIGHTS.countyExact +
    placeExact * GEO_RANK_WEIGHTS.placeExact +
    sameParentArea * GEO_RANK_WEIGHTS.sameParentArea +
    distanceScore * GEO_RANK_WEIGHTS.distance +
    Math.min(1, placeImportance) * GEO_RANK_WEIGHTS.placeImportance;

  return {
    countyExact,
    placeExact,
    sameParentArea,
    distanceScore,
    placeImportance: Math.min(1, placeImportance),
    total,
  };
}
