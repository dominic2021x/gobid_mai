/**
 * Extract category/subcategory pattern candidates from taxonomy.
 */

import type { MarketplaceTaxonomy } from "../types";
import { normalizePatternInput } from "../normalizePatternInput";

export type CategoryCandidate = {
  phrase_norm: string;
  phrase: string;
  category?: string;
  subcategory?: string;
};

/**
 * Get category + subcategory phrase candidates from taxonomy (for suggest seed or ranking).
 */
export function extractCategoryCandidates(taxonomy: MarketplaceTaxonomy): CategoryCandidate[] {
  const out: CategoryCandidate[] = [];
  for (const cat of taxonomy.categorySlugs) {
    const normalized = normalizePatternInput(cat).normalized;
    if (normalized) {
      out.push({
        phrase_norm: normalized,
        phrase: cat,
        category: cat,
      });
    }
    const subs = taxonomy.subcategoryByCategory.get(cat);
    if (subs) {
      for (const sub of subs) {
        const phraseNorm = normalizePatternInput(`${cat} ${sub}`).normalized;
        if (phraseNorm) {
          out.push({
            phrase_norm: phraseNorm,
            phrase: `${cat} ${sub}`,
            category: cat,
            subcategory: sub,
          });
        }
      }
    }
  }
  return out;
}
