/**
 * Geo search constants: place type order, distance limits, ranking weights.
 */

import type { GeoPlaceType } from "./types";

/** Order for county-wide expansion: major cities first, then towns, etc. */
export const PLACE_TYPE_EXPANSION_ORDER: GeoPlaceType[] = [
  "municipality",
  "city",
  "town",
  "commune",
  "village",
];

/** Default importance when not in DB. */
export const DEFAULT_IMPORTANCE = 0.5;

/** Max distance (km) for "nearby" tier when expanding from a place. */
export const NEARBY_MAX_KM = 25;

/** Max number of nearby places to include. */
export const NEARBY_MAX_PLACES = 15;

/** Min token length to consider for location token. */
export const MIN_LOCATION_TOKEN_LEN = 2;

/** Geo ranking weights (configurable). */
export const GEO_RANK_WEIGHTS = {
  countyExact: 2.0,
  placeExact: 3.0,
  sameParentArea: 1.2,
  distance: 1.0,
  placeImportance: 0.5,
} as const;

/** Max km for distance score decay. */
export const GEO_MAX_KM_FOR_DISTANCE = 50;

/** Romanian diacritics map for normalizing location names. */
export const DIACRITICS_MAP: Record<string, string> = {
  ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t",
  Ă: "a", Â: "a", Î: "i", Ș: "s", Ş: "s", Ț: "t", Ţ: "t",
};
