/**
 * Composite extractor: runs all extractors and returns unified candidates.
 */

import type { MarketplaceTaxonomy } from "../types";
import { extractCategoryCandidates } from "./categoryPatternExtractor";
import { extractBrandCandidates } from "./brandPatternExtractor";
import { extractAttributeCandidates } from "./attributePatternExtractor";
import { extractGeoCandidates, extractCategoryGeoCandidates } from "./geoPatternExtractor";

export type CompositeCandidate = {
  phrase_norm: string;
  phrase: string;
  source: "category" | "brand" | "attribute" | "geo" | "category_geo";
  meta?: Record<string, unknown>;
};

/**
 * Extract all pattern candidates from taxonomy (for seeding or ranking).
 */
export function extractCompositeCandidates(taxonomy: MarketplaceTaxonomy): CompositeCandidate[] {
  const seen = new Set<string>();
  const out: CompositeCandidate[] = [];

  for (const c of extractCategoryCandidates(taxonomy)) {
    if (!seen.has(c.phrase_norm)) {
      seen.add(c.phrase_norm);
      out.push({
        phrase_norm: c.phrase_norm,
        phrase: c.phrase,
        source: c.subcategory ? "category" : "category",
        meta: { category: c.category, subcategory: c.subcategory },
      });
    }
  }

  for (const b of extractBrandCandidates(taxonomy)) {
    if (!seen.has(b.phrase_norm)) {
      seen.add(b.phrase_norm);
      out.push({
        phrase_norm: b.phrase_norm,
        phrase: b.phrase,
        source: "brand",
        meta: { brand: b.brand, model: b.model },
      });
    }
  }

  for (const a of extractAttributeCandidates(taxonomy)) {
    if (!seen.has(a.phrase_norm)) {
      seen.add(a.phrase_norm);
      out.push({
        phrase_norm: a.phrase_norm,
        phrase: a.phrase,
        source: "attribute",
        meta: { category: a.category, attributeKey: a.attributeKey },
      });
    }
  }

  for (const g of extractGeoCandidates(taxonomy)) {
    if (!seen.has(g.phrase_norm)) {
      seen.add(g.phrase_norm);
      out.push({
        phrase_norm: g.phrase_norm,
        phrase: g.phrase,
        source: "geo",
        meta: { geo: g.geo, kind: g.kind },
      });
    }
  }

  const categoryGeo = extractCategoryGeoCandidates(taxonomy, ["executari", "apartament", "teren"]);
  for (const cg of categoryGeo) {
    if (!seen.has(cg.phrase_norm)) {
      seen.add(cg.phrase_norm);
      out.push({
        phrase_norm: cg.phrase_norm,
        phrase: cg.phrase,
        source: "category_geo",
        meta: { category: cg.category, geo: cg.geo },
      });
    }
  }

  return out;
}
