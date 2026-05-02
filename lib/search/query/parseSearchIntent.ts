/**
 * Parse full search intent from query: text, category/vertical, location.
 * Composes geo parse + category detection.
 */

import type { SearchIntent } from "./types";
import type { ParsedLocation } from "../geo/types";
import { parseLocationFromQuery, type GeoResolver } from "../geo/parseLocationFromQuery";
import { normalizeLocation } from "../geo/normalizeLocation";

/** Category slugs we recognize from query tokens or phrases. */
const CATEGORY_PATTERNS: Array<{ slugs: [string, string?]; tokens: string[] }> = [
  { slugs: ["imobiliare", undefined], tokens: ["imobiliare", "apartament", "teren", "casa", "spatiu comercial"] },
  { slugs: ["autovehicule", undefined], tokens: ["autovehicule", "auto", "masini", "masina", "autoturism", "autoutilitara"] },
  { slugs: ["executari_insolventa", "executari"], tokens: ["executari", "insolventa", "licitatii", "licitatie"] },
  { slugs: ["utilaje", undefined], tokens: ["utilaje", "utilaj", "echipamente", "buldoexcavator"] },
];

function detectCategorySlug(queryNorm: string): { categorySlug: string | null; subcategorySlug: string | null } {
  const tokens = new Set(queryNorm.split(/\s+/).filter(Boolean));
  for (const { slugs, tokens: pat } of CATEGORY_PATTERNS) {
    for (const t of pat) {
      if (tokens.has(t) || queryNorm.includes(t)) {
        return { categorySlug: slugs[0] ?? null, subcategorySlug: slugs[1] ?? null };
      }
    }
  }
  return { categorySlug: null, subcategorySlug: null };
}

/**
 * Parse search intent: location (async with optional resolver) + category/vertical.
 */
export async function parseSearchIntent(
  query: string,
  geoResolver?: GeoResolver | null
): Promise<SearchIntent> {
  const queryNorm = normalizeLocation(query);
  const location = await parseLocationFromQuery(queryNorm, geoResolver ?? null);
  const { categorySlug, subcategorySlug } = detectCategorySlug(queryNorm);

  const matchedSet = new Set(location.matchedTokens.map((t) => normalizeLocation(t)));
  const queryWithoutGeo = queryNorm
    .split(/\s+/)
    .filter((t) => !matchedSet.has(normalizeLocation(t)))
    .join(" ")
    .trim();

  const isNavigational =
    queryNorm.split(/\s+/).length <= 3 &&
    (!!categorySlug || !!location.countyCode || !!location.placeNameNorm);

  return {
    queryNorm,
    queryWithoutGeo: queryWithoutGeo || queryNorm,
    categorySlug,
    subcategorySlug,
    vertical: categorySlug ?? null,
    location,
    isNavigational,
  };
}
