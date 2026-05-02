/**
 * Infer vertical (and optionally category) from partial query using pattern engine.
 * Used to improve intent detection when category is not explicitly in the query.
 */

import { buildMarketplaceTaxonomy } from "./buildMarketplaceTaxonomy";
import { matchPatternProfile } from "./matchPatternProfile";
import { getProfileForVertical } from "./profiles/getProfileForVertical";
import type { VerticalSlug } from "./types";

const CATEGORY_TO_VERTICAL: Record<string, VerticalSlug> = {
  autovehicule: "auto",
  imobiliare: "real_estate",
  executari_insolventa: "executari",
  executari: "executari",
  utilaje: "agri_industrial",
  electronice: "electronics",
  "casa-gradina": "home_garden",
  agricultura: "agri_industrial",
  industria: "agri_industrial",
};

/**
 * Infer vertical from normalized query using pattern match (category/brand segments).
 */
export function inferVerticalFromQuery(queryNorm: string): {
  vertical: VerticalSlug;
  categorySlug: string | null;
} | null {
  if (!queryNorm?.trim()) return null;
  const taxonomy = buildMarketplaceTaxonomy();
  const profile = getProfileForVertical(null);
  const match = matchPatternProfile(queryNorm, { taxonomy, profile });
  if (match.invalid || match.patternType === "invalid") return null;
  const categorySlug = match.segments.category ?? null;
  if (!categorySlug) return null;
  const vertical = CATEGORY_TO_VERTICAL[categorySlug] ?? "universal";
  if (vertical === "universal") return null;
  return { vertical, categorySlug };
}
