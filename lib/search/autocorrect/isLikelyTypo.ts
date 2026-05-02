/**
 * Decide if a token is likely a typo (not in dictionary, long enough, not protected).
 */

import { NEVER_CORRECT_PATTERN, MIN_TOKEN_LENGTH_FOR_TYPO } from "./constants";
import type { SearchDictionary, GeoDictionary, BrandDictionary } from "./types";

export type Dictionaries = {
  search: SearchDictionary;
  geo: GeoDictionary;
  brand: BrandDictionary;
};

/**
 * True if token should be considered for correction: length >= 3, not pure number/short, not in any dictionary.
 */
export function isLikelyTypo(
  token: string,
  dicts: Dictionaries
): boolean {
  const t = token.toLowerCase().trim();
  if (t.length < MIN_TOKEN_LENGTH_FOR_TYPO) return false;
  if (NEVER_CORRECT_PATTERN.test(t)) return false;
  if (dicts.search.all.has(t)) return false;
  if (dicts.geo.all.has(t)) return false;
  if (dicts.brand.all.has(t)) return false;
  return true;
}
