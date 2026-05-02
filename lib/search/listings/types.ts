/**
 * Types for listing search: candidates, features, geo context.
 */

import type { GeoExpansionTier } from "../geo/types";

export interface ListingGeoRow {
  listing_id: string;
  county_id: string | null;
  place_id: string | null;
  parent_place_id: string | null;
  lat: number | null;
  lng: number | null;
  geo_quality: string;
}

export interface ListingSearchFeatures {
  textualRelevance: number;
  categoryMatch: number;
  subcategoryMatch: number;
  countyExact: number;
  placeExact: number;
  sameParentArea: number;
  distanceScore: number;
  placeImportance: number;
  premiumBoost: number;
  freshness: number;
  engagement: number;
  listingQuality: number;
  tierOrder: number;
}

export interface ListingCandidateWithGeo {
  id: string;
  item: Record<string, unknown>;
  /** From listing_geo if joined. */
  geo: ListingGeoRow | null;
  /** Which expansion tier this listing belongs to (when using geo plan). */
  tierOrder: number;
  /** Precomputed score from lexical/semantic (optional). */
  baseScore?: number;
}

export interface RankedListingResult extends ListingCandidateWithGeo {
  features: ListingSearchFeatures;
  finalScore: number;
}

export interface GeoRankContext {
  /** Target county id from query. */
  countyId: string | null;
  /** Target place id from query. */
  placeId: string | null;
  /** Ordered tiers for progressive expansion. */
  tiers: GeoExpansionTier[];
}
