/**
 * Extract brand (and brand+model) pattern candidates from taxonomy.
 */

import type { MarketplaceTaxonomy } from "../types";
import { normalizePatternInput } from "../normalizePatternInput";

export type BrandCandidate = {
  phrase_norm: string;
  phrase: string;
  brand: string;
  model?: string;
};

/**
 * Get brand-only and brand+model phrase candidates from taxonomy.
 */
export function extractBrandCandidates(taxonomy: MarketplaceTaxonomy): BrandCandidate[] {
  const out: BrandCandidate[] = [];
  for (const brand of taxonomy.brandSlugs) {
    const normalized = normalizePatternInput(brand).normalized;
    if (normalized) {
      out.push({ phrase_norm: normalized, phrase: brand, brand });
    }
    const models = taxonomy.modelByBrand.get(brand);
    if (models) {
      for (const model of models) {
        const phrase = `${brand} ${model}`;
        const phraseNorm = normalizePatternInput(phrase).normalized;
        if (phraseNorm) {
          out.push({ phrase_norm: phraseNorm, phrase, brand, model });
        }
      }
    }
  }
  return out;
}
