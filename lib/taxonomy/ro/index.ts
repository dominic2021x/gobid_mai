/**
 * Taxonomy wrapper – single source of truth. Re-exports from ro-categories + taxonomy.ts.
 * Helpers: listAllCategories, listAllSubcategories, listAllLeaves, isValidCategory/Subcategory/Level3.
 */

import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import {
  RO_TAXONOMY,
  RO_LEVEL3_BY_SUBCATEGORY,
  getLevel3ForSubcategory,
  isLevel3Valid as isLevel3ValidInTaxonomy,
} from "@/lib/taxonomy/ro/taxonomy";

export { RO_CATEGORIES, RO_SUBCATEGORY_NAMES };
export { RO_TAXONOMY, RO_LEVEL3_BY_SUBCATEGORY, getLevel3ForSubcategory };

/** Category slugs (exclude "all"). */
export function listAllCategories(): string[] {
  return Object.keys(RO_CATEGORIES).filter((k) => k !== "all");
}

/** Subcategory slugs for a category. */
export function listAllSubcategories(categorySlug: string): string[] {
  const entry = RO_CATEGORIES[categorySlug];
  return entry?.subcategories ?? [];
}

/** All leaves: { categorySlug, subcategorySlug, level3Slugs? }. */
export function listAllLeaves(): Array<{ categorySlug: string; subcategorySlug: string; level3Slugs?: string[] }> {
  const out: Array<{ categorySlug: string; subcategorySlug: string; level3Slugs?: string[] }> = [];
  for (const cat of listAllCategories()) {
    for (const sub of listAllSubcategories(cat)) {
      const l3 = RO_LEVEL3_BY_SUBCATEGORY[sub];
      out.push({
        categorySlug: cat,
        subcategorySlug: sub,
        level3Slugs: l3?.length ? l3 : undefined,
      });
    }
  }
  return out;
}

export function isValidCategory(categorySlug: string): boolean {
  return categorySlug !== "all" && Object.prototype.hasOwnProperty.call(RO_CATEGORIES, categorySlug);
}

export function isValidSubcategory(categorySlug: string, subcategorySlug: string): boolean {
  const subs = listAllSubcategories(categorySlug);
  return subs.includes(subcategorySlug);
}

export function isLevel3Valid(categorySlug: string, subcategorySlug: string, level3Slug: string): boolean {
  return isLevel3ValidInTaxonomy(categorySlug, subcategorySlug, level3Slug);
}
