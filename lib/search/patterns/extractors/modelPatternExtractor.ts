/**
 * Extract model-like tokens from a title (e.g. "BMW Seria 3 320d" -> brand + model).
 * Lightweight: no heavy NLP; use for pattern hints.
 */

import { normalizePatternInput } from "../normalizePatternInput";
import type { MarketplaceTaxonomy } from "../types";

export type ModelCandidate = {
  phrase_norm: string;
  phrase: string;
  brand?: string;
  model?: string;
};

/**
 * From a listing title, try to extract a brand + model phrase using taxonomy brands.
 */
export function extractModelFromTitle(
  title: string,
  taxonomy: MarketplaceTaxonomy
): ModelCandidate | null {
  const { tokens } = normalizePatternInput(title);
  if (tokens.length === 0) return null;

  for (let i = 0; i < tokens.length; i++) {
    let acc = tokens[i] ?? "";
    if (taxonomy.brandSlugs.has(acc)) {
      const brand = acc;
      const rest = tokens.slice(i + 1).filter((t) => /[\p{L}\p{N}\-]/u.test(t)).slice(0, 3);
      if (rest.length > 0) {
        const model = rest.join(" ");
        const phrase = `${brand} ${model}`;
        const phraseNorm = normalizePatternInput(phrase).normalized;
        return { phrase_norm: phraseNorm, phrase, brand, model };
      }
      return { phrase_norm: normalizePatternInput(brand).normalized, phrase: brand, brand };
    }
    for (let j = i + 1; j < tokens.length; j++) {
      acc = acc + " " + (tokens[j] ?? "");
      if (taxonomy.brandSlugs.has(acc)) {
        const brand = acc;
        const rest = tokens.slice(j + 1).filter((t) => /[\p{L}\p{N}\-]/u.test(t)).slice(0, 3);
        if (rest.length > 0) {
          const model = rest.join(" ");
          const phrase = `${brand} ${model}`;
          const phraseNorm = normalizePatternInput(phrase).normalized;
          return { phrase_norm: phraseNorm, phrase, brand, model };
        }
        return { phrase_norm: normalizePatternInput(brand).normalized, phrase: brand, brand };
      }
    }
  }
  return null;
}
