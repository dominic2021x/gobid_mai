/**
 * Map a listing's geo (listing_geo row) to the expansion tier order for ranking.
 */

import type { ListingGeoRow } from "./types";
import type { GeoExpansionTier } from "../geo/types";

const FALLBACK_TIER_ORDER = 999;

/**
 * Return the tier order for this listing (lower = higher priority).
 * If no geo or no match, returns FALLBACK_TIER_ORDER.
 */
export function getTierOrderForListing(
  listingGeo: ListingGeoRow | null,
  tiers: GeoExpansionTier[]
): number {
  if (!listingGeo || tiers.length === 0) return FALLBACK_TIER_ORDER;

  const countyId = listingGeo.county_id ?? null;
  const placeId = listingGeo.place_id ?? null;

  for (const t of tiers) {
    if (t.countyId && listingGeo.county_id !== t.countyId) continue;
    if (t.placeIds.length === 0) return t.order; // county_rest or similar
    if (placeId && t.placeIds.includes(placeId)) return t.order;
  }

  return FALLBACK_TIER_ORDER;
}
