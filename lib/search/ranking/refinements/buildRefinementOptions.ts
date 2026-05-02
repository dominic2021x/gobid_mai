/**
 * Build refinement options (facets) for search UI: category, county, etc.
 * Can be ordered by search_refinement_stats when available.
 */

export interface RefinementOption {
  value: string;
  label: string;
  count: number;
  /** Optional: score from behavior (CTR, selects). */
  score?: number;
}

export interface RefinementGroup {
  key: string;
  label: string;
  options: RefinementOption[];
}

/**
 * Build refinement groups from facet counts. Preserves order by count desc.
 */
export function buildRefinementOptions(facets: {
  category?: Array<{ value: string; label?: string; count: number }>;
  county?: Array<{ value: string; count: number }>;
}): RefinementGroup[] {
  const groups: RefinementGroup[] = [];

  if (facets.category?.length) {
    groups.push({
      key: "category",
      label: "Categorie",
      options: facets.category.map((f) => ({
        value: f.value,
        label: f.label ?? f.value,
        count: f.count,
      })),
    });
  }

  if (facets.county?.length) {
    groups.push({
      key: "county",
      label: "Județ",
      options: facets.county.map((f) => ({
        value: f.value,
        label: f.value,
        count: f.count,
      })),
    });
  }

  return groups;
}

/**
 * Reorder options by external scores (e.g. from search_refinement_stats).
 */
export function applyRefinementScores(
  groups: RefinementGroup[],
  scores: Map<string, number> // key = "category:imobiliare" or "county:Dolj"
): RefinementGroup[] {
  return groups.map((g) => ({
    ...g,
    options: [...g.options]
      .map((o) => ({
        ...o,
        score: scores.get(`${g.key}:${o.value}`),
      }))
      .sort((a, b) => (b.score ?? b.count) - (a.score ?? a.count)),
  }));
}
