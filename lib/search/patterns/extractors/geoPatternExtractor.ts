/**
 * Extract geo-only and category+geo pattern candidates.
 */

import type { MarketplaceTaxonomy } from "../types";
import { normalizePatternInput } from "../normalizePatternInput";

export type GeoCandidate = {
  phrase_norm: string;
  phrase: string;
  geo: string[];
  kind: "county" | "city";
};

/**
 * Get geo-only phrase candidates (counties, cities).
 */
export function extractGeoCandidates(taxonomy: MarketplaceTaxonomy): GeoCandidate[] {
  const out: GeoCandidate[] = [];
  for (const c of taxonomy.geoCounties) {
    const phraseNorm = normalizePatternInput(c).normalized;
    if (phraseNorm) {
      out.push({
        phrase_norm: phraseNorm,
        phrase: c,
        geo: [c],
        kind: "county",
      });
    }
  }
  for (const c of taxonomy.geoCities) {
    const phraseNorm = normalizePatternInput(c).normalized;
    if (phraseNorm) {
      out.push({
        phrase_norm: phraseNorm,
        phrase: c,
        geo: [c],
        kind: "city",
      });
    }
  }
  return out;
}

/**
 * Combine category + geo (e.g. "executari dolj", "apartament bucuresti").
 */
export function extractCategoryGeoCandidates(
  taxonomy: MarketplaceTaxonomy,
  categorySlugs: string[]
): Array<{ phrase_norm: string; phrase: string; category: string; geo: string }> {
  const out: Array<{ phrase_norm: string; phrase: string; category: string; geo: string }> = [];
  for (const cat of categorySlugs) {
    if (!taxonomy.categorySlugs.has(cat)) continue;
    for (const geo of taxonomy.geoCounties) {
      const phrase = `${cat} ${geo}`;
      const phraseNorm = normalizePatternInput(phrase).normalized;
      if (phraseNorm) out.push({ phrase_norm: phraseNorm, phrase, category: cat, geo });
    }
  }
  return out;
}
