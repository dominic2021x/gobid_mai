/**
 * Extract structured filters from search intent for DB/API.
 */

import type { SearchIntent } from "./types";
import type { StructuredFilters } from "./types";

/**
 * Build filters from intent: category, subcategory, county/city/place for listing queries.
 */
export function extractStructuredFilters(intent: SearchIntent): StructuredFilters {
  const filters: StructuredFilters = {};
  if (intent.categorySlug) filters.category = intent.categorySlug;
  if (intent.subcategorySlug) filters.subcategory = intent.subcategorySlug;
  if (intent.location.countyCode) filters.county = intent.location.countyCode;
  if (intent.location.placeId) filters.placeId = intent.location.placeId;
  if (intent.location.countyId) filters.countyId = intent.location.countyId;
  if (intent.location.placeNameNorm) filters.city = intent.location.placeNameNorm;
  return filters;
}
