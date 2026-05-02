/**
 * Soft autocorrect for gobid.ro search and autocomplete.
 * Typo-tolerant, Romanian diacritics-insensitive, safe and non-aggressive.
 */

import type { MarketplaceTaxonomy } from "@/lib/search/patterns/types";
import { normalizeSearchQuery } from "./normalizeSearchQuery";
import { buildAutocorrectResult } from "./buildAutocorrectResult";
import { getSearchDictionary } from "./dictionaries/getSearchDictionary";
import { getGeoDictionary } from "./dictionaries/getGeoDictionary";
import { getBrandDictionary } from "./dictionaries/getBrandDictionary";
import type { AutocorrectResult } from "./types";
import type { Dictionaries } from "./isLikelyTypo";

export type { AutocorrectResult, CorrectionCandidate, TokenizedQuery } from "./types";
export { normalizeSearchQuery } from "./normalizeSearchQuery";
export { buildAutocorrectResult } from "./buildAutocorrectResult";
export {
  MIN_CONFIDENCE_TO_APPLY,
  MIN_CONFIDENCE_DID_YOU_MEAN,
  MIN_CONFIDENCE_FALLBACK,
} from "./constants";
export { trackAutocorrectEvent } from "./trackAutocorrect";
export type { TrackAutocorrectPayload, AutocorrectEventType } from "./trackAutocorrect";

/**
 * Run autocorrect for a query using existing taxonomy (no extra fetch).
 * Use in suggest and v2 routes after taxonomy is loaded.
 */
export function getAutocorrectResult(
  normalizedQuery: string,
  taxonomy: MarketplaceTaxonomy
): AutocorrectResult {
  const dicts: Dictionaries = {
    search: getSearchDictionary(taxonomy),
    geo: getGeoDictionary(taxonomy),
    brand: getBrandDictionary(taxonomy),
  };
  return buildAutocorrectResult(normalizedQuery, dicts);
}
