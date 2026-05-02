/**
 * Taxonomy helpers for recategorization agent.
 * List slugs, validate against RO_CATEGORIES, map legacy exec-* subcategories to real taxonomy.
 */

import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import {
  listAllCategories,
  listAllSubcategories,
  isValidCategory,
  isValidSubcategory,
  isLevel3Valid,
} from "@/lib/taxonomy/ro";

export { listAllCategories, listAllSubcategories, isValidCategory, isValidSubcategory, isLevel3Valid };

/** All category slugs (exclude "all"). */
export function listCategorySlugs(): string[] {
  return listAllCategories();
}

/** All subcategory slugs for a category. */
export function listSubcategorySlugs(categorySlug: string): string[] {
  return listAllSubcategories(categorySlug);
}

/**
 * Validate category and subcategory (and optional level3) against RO_CATEGORIES.
 */
export function validateSlugs(params: {
  categorySlug: string;
  subcategorySlug: string;
  level3Slug?: string | null;
}): boolean {
  if (!isValidCategory(params.categorySlug)) return false;
  if (!isValidSubcategory(params.categorySlug, params.subcategorySlug)) return false;
  if (params.level3Slug != null && params.level3Slug !== "") {
    if (!isLevel3Valid(params.categorySlug, params.subcategorySlug, params.level3Slug)) return false;
  }
  return true;
}

/** Legacy exec-* subcategory -> real taxonomy (category + subcategory) for item nature. */
const EXEC_TO_TAXONOMY: Record<string, { categorySlug: string; subcategorySlug: string }> = {
  "exec-imobiliare": { categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  "exec-autovehicule": { categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  "exec-industrial": { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii" },
  "exec-afaceri": { categorySlug: "diverse", subcategorySlug: "colectii-private" },
  "exec-office": { categorySlug: "casa", subcategorySlug: "mobilier-interior" },
  "exec-altele": { categorySlug: "diverse", subcategorySlug: "colectii-private" },
  "utilaje-echipamente": { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii" },
  "oferte-grupate": { categorySlug: "diverse", subcategorySlug: "colectii-private" },
};

/**
 * Map legacy executari subcategory (exec-* or utilaje-echipamente, oferte-grupate) to real taxonomy.
 * Returns null if not a legacy exec sub or slug not in map.
 */
export function mapLegacyExecSubcategoryToTaxonomy(execSubcategorySlug: string): {
  categorySlug: string;
  subcategorySlug: string;
} | null {
  const sub = (execSubcategorySlug ?? "").trim().toLowerCase();
  if (!sub) return null;
  const mapped = EXEC_TO_TAXONOMY[sub];
  if (!mapped) return null;
  if (!RO_CATEGORIES[mapped.categorySlug]?.subcategories?.includes(mapped.subcategorySlug)) return null;
  return mapped;
}

/**
 * Check if subcategory is a legacy exec-* (or executari-specific) slug.
 */
export function isLegacyExecSubcategory(subcategorySlug: string): boolean {
  const sub = (subcategorySlug ?? "").trim().toLowerCase();
  return sub.startsWith("exec-") || sub === "utilaje-echipamente" || sub === "oferte-grupate";
}
