/**
 * Generate correction candidates for a token from dictionaries (Levenshtein + prefix).
 */

import { MAX_EDIT_DISTANCE, MAX_CANDIDATES_PER_TOKEN } from "./constants";
import { levenshteinDistance } from "./levenshtein";
import { scoreCorrectionCandidate } from "./scoreCorrectionCandidate";
import type { SearchDictionary, GeoDictionary, BrandDictionary } from "./types";
import type { CorrectionCandidate } from "./types";

export type Dictionaries = {
  search: SearchDictionary;
  geo: GeoDictionary;
  brand: BrandDictionary;
};

function* iterSearchDict(d: SearchDictionary): Iterable<{ term: string; source: CorrectionCandidate["source"] }> {
  for (const term of d.categories) yield { term, source: "category" };
  for (const term of d.subcategories) yield { term, source: "subcategory" };
  for (const term of d.attributes) yield { term, source: "attribute" };
}

function* iterGeoDict(d: GeoDictionary): Iterable<{ term: string; source: CorrectionCandidate["source"] }> {
  for (const term of d.counties) yield { term, source: "geo" };
  for (const term of d.cities) yield { term, source: "geo" };
}

function* iterBrandDict(d: BrandDictionary): Iterable<{ term: string; source: CorrectionCandidate["source"] }> {
  for (const term of d.brands) yield { term, source: "brand" };
  for (const models of d.modelByBrand.values()) {
    for (const term of models) yield { term, source: "model" };
  }
}

/**
 * Generate candidate corrections for a single token (bounded count).
 */
export function generateCorrectionCandidates(
  token: string,
  dicts: Dictionaries
): CorrectionCandidate[] {
  const t = token.toLowerCase().trim();
  const candidates: Array<{ corrected: string; source: CorrectionCandidate["source"]; dist: number }> = [];
  const maxDist = MAX_EDIT_DISTANCE;

  const consider = (term: string, source: CorrectionCandidate["source"]) => {
    if (term.length < 2) return;
    const dist = levenshteinDistance(t, term, maxDist);
    if (dist <= maxDist) candidates.push({ corrected: term, source, dist });
  };

  for (const { term, source } of iterSearchDict(dicts.search)) consider(term, source);
  for (const { term, source } of iterGeoDict(dicts.geo)) consider(term, source);
  for (const { term, source } of iterBrandDict(dicts.brand)) consider(term, source);

  candidates.sort((a, b) => a.dist - b.dist);
  const unique = new Set<string>();
  const out: CorrectionCandidate[] = [];
  for (const c of candidates) {
    if (out.length >= MAX_CANDIDATES_PER_TOKEN) break;
    if (unique.has(c.corrected)) continue;
    unique.add(c.corrected);
    const score = scoreCorrectionCandidate(token, c.corrected, c.dist, c.source);
    out.push({
      original: token,
      corrected: c.corrected,
      score,
      source: c.source,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
