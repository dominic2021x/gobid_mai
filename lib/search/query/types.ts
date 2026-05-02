/**
 * Types for structured search intent and search plan.
 */

import type { ParsedLocation, GeoExpansionPlan } from "../geo/types";

export interface SearchIntent {
  /** Normalized query text (no location tokens stripped). */
  queryNorm: string;
  /** Text without geo tokens (for lexical search). */
  queryWithoutGeo: string;
  /** Category slug if detected (e.g. imobiliare, autovehicule). */
  categorySlug: string | null;
  /** Subcategory slug if detected. */
  subcategorySlug: string | null;
  /** Vertical/category intent label. */
  vertical: string | null;
  /** Parsed location (county/place). */
  location: ParsedLocation;
  /** Whether this looks like a navigational query (e.g. "executari dolj"). */
  isNavigational: boolean;
}

export interface StructuredFilters {
  category?: string | null;
  subcategory?: string | null;
  county?: string | null;
  city?: string | null;
  placeId?: string | null;
  countyId?: string | null;
}

/** Search plan: intent + geo expansion + filters for DB. */
export interface SearchPlan {
  intent: SearchIntent;
  geoPlan: GeoExpansionPlan | null;
  filters: StructuredFilters;
  /** Suggested limit for first tier (progressive). */
  firstTierLimit: number;
}
