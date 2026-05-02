/**
 * Validate category/subcategory (and optional level3) against central taxonomy before applying.
 * If invalid -> caller should skip apply and log (DEBUG). Single source of truth: lib/data/ro-categories + taxonomy.
 */

import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { isLevel3Valid, isLevel4Valid } from "@/lib/taxonomy/ro/taxonomy";

export type VerifyTaxonomyResult = { valid: boolean; error?: string };

/**
 * Validate that category and subcategory exist in RO_CATEGORIES.
 * If level3Slug is provided and taxonomy has a level3 list for that subcategory, validate it.
 * If level4Slug is provided (terenuri / exec-imobiliare), validate it.
 */
export function verifyTaxonomy(params: {
  categorySlug: string;
  subcategorySlug: string;
  level3Slug?: string | null;
  level4Slug?: string | null;
}): VerifyTaxonomyResult {
  const cat = (params.categorySlug ?? "").trim();
  const sub = (params.subcategorySlug ?? "").trim();
  const l3 = params.level3Slug != null ? String(params.level3Slug).trim() : null;
  const l4 = params.level4Slug != null ? String(params.level4Slug).trim() : null;

  if (!cat) return { valid: false, error: "Missing category slug." };
  if (!sub) return { valid: false, error: "Missing subcategory slug." };

  const entry = RO_CATEGORIES[cat];
  if (!entry) return { valid: false, error: `Unknown category slug: ${cat}.` };
  if (!entry.subcategories?.includes(sub)) {
    return { valid: false, error: `Subcategory "${sub}" not in category "${cat}".` };
  }

  if (l3 && !isLevel3Valid(cat, sub, l3)) {
    return { valid: false, error: `Level3 "${l3}" not in taxonomy for ${cat}/${sub}.` };
  }
  if (l4 && !isLevel4Valid(sub, l4)) {
    return { valid: false, error: `Level4 "${l4}" not in taxonomy for subcategory "${sub}".` };
  }
  return { valid: true };
}
