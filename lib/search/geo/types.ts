/**
 * Types for geo-aware search: counties, places, parsed location, expansion tiers.
 */

export type GeoPlaceType = "municipality" | "city" | "town" | "commune" | "village";

export interface GeoCounty {
  id: string;
  code: string;
  name: string;
  name_norm: string;
}

export interface GeoPlace {
  id: string;
  county_id: string;
  name: string;
  name_norm: string;
  type: GeoPlaceType;
  parent_place_id: string | null;
  lat: number | null;
  lng: number | null;
  population_rank: number | null;
  importance_score: number;
}

export interface GeoPlaceAlias {
  place_id: string;
  alias: string;
  alias_norm: string;
}

/** Parsed location from query: county and/or place (city/town/commune/village). */
export interface ParsedLocation {
  /** County code or slug (e.g. dolj, ab). */
  countyCode: string | null;
  /** Resolved county id if from DB. */
  countyId: string | null;
  /** Place name norm (e.g. craiova). */
  placeNameNorm: string | null;
  /** Resolved place id if from DB. */
  placeId: string | null;
  /** Place type when resolved. */
  placeType: GeoPlaceType | null;
  /** Raw token(s) that matched (for highlighting). */
  matchedTokens: string[];
  /** Ambiguous: multiple places matched (e.g. multiple "Valea" in different counties). */
  ambiguous: boolean;
}

/** One tier in geo expansion: e.g. "exact city" then "nearby" then "county". */
export interface GeoExpansionTier {
  tier: "exact_place" | "nearby_places" | "county_rest" | "county_major" | "county_towns" | "county_communes" | "county_villages" | "fallback";
  /** County id for this tier (when applicable). */
  countyId: string | null;
  /** Place ids included in this tier (when applicable). */
  placeIds: string[];
  /** Human-readable label for UI. */
  label: string;
  /** Order: lower = higher priority. */
  order: number;
}

/** Full geo expansion plan for a parsed query. */
export interface GeoExpansionPlan {
  parsedLocation: ParsedLocation;
  tiers: GeoExpansionTier[];
  /** Whether query had any geo intent. */
  hasGeoIntent: boolean;
}
