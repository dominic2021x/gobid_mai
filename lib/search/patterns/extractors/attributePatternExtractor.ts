/**
 * Extract category + attribute pattern candidates (e.g. "apartament 2 camere", "teren 5 ha").
 */

import type { MarketplaceTaxonomy } from "../types";
import { normalizePatternInput } from "../normalizePatternInput";

const CATEGORY_ATTRIBUTE_PAIRS: Array<{ category: string; attributeKey: string; values?: string[] }> = [
  { category: "apartament", attributeKey: "camere", values: ["1", "2", "3", "4", "5"] },
  { category: "teren", attributeKey: "ha" },
  { category: "teren", attributeKey: "extravilan" },
  { category: "teren", attributeKey: "intravilan" },
  { category: "spatiu", attributeKey: "comercial" },
  { category: "spatiu", attributeKey: "rezidential" },
];

export type AttributeCandidate = {
  phrase_norm: string;
  phrase: string;
  category: string;
  attributeKey: string;
  attributeValue?: string;
};

/**
 * Get category + attribute phrase candidates for suggestions.
 */
export function extractAttributeCandidates(
  taxonomy: MarketplaceTaxonomy
): AttributeCandidate[] {
  const out: AttributeCandidate[] = [];
  for (const pair of CATEGORY_ATTRIBUTE_PAIRS) {
    if (pair.values) {
      for (const v of pair.values) {
        const phrase = `${pair.category} ${v} ${pair.attributeKey}`;
        const phraseNorm = normalizePatternInput(phrase).normalized;
        if (phraseNorm) {
          out.push({
            phrase_norm: phraseNorm,
            phrase,
            category: pair.category,
            attributeKey: pair.attributeKey,
            attributeValue: v,
          });
        }
      }
    } else {
      const phrase = `${pair.category} ${pair.attributeKey}`;
      const phraseNorm = normalizePatternInput(phrase).normalized;
      if (phraseNorm) {
        out.push({
          phrase_norm: phraseNorm,
          phrase,
          category: pair.category,
          attributeKey: pair.attributeKey,
        });
      }
    }
  }
  return out;
}
