/**
 * Enterprise taxonomy wrapper – single source of truth for /api/ro/listings filters.
 * Bridges lib/data/ro-categories.ts; no duplication. Categories -> subcategories -> level3 slugs.
 */

import {
  RO_CATEGORIES,
  RO_SUBCATEGORY_NAMES,
  RO_LAND_TAXONOMY,
  type RoCategoryEntry,
} from "@/lib/data/ro-categories";
import {
  PIESE_AUTO_LEVEL3_SLUGS,
  PIESE_AUTO_LEVEL3_LABELS,
} from "@/lib/piese-auto/tip-piesa-level3";

export { RO_CATEGORIES, RO_SUBCATEGORY_NAMES, RO_LAND_TAXONOMY };
export type { RoCategoryEntry };

/** Re-export: tip piesă = aceleași opțiuni ca anunț manual / my-products. */
export { PIESE_AUTO_LEVEL3_SLUGS, PIESE_AUTO_LEVEL3_LABELS };

/** Level3 slugs per (category, subcategory). Optional; only where taxonomy defines them. */
export const RO_LEVEL3_BY_SUBCATEGORY: Record<string, string[]> = {
  "terenuri": ["terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole"],
  /** Executări – Imobiliare: același tip teren (level 4 în UI) ca la terenuri. */
  "exec-imobiliare": ["terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole"],
  "autoturisme": ["berlina", "suv", "break", "hatchback", "coupe", "cabrio", "van", "minivan"],
  "suv-4x4": ["suv", "offroad"],
  "piese-auto": [...PIESE_AUTO_LEVEL3_SLUGS],
  "haine-designer": ["pantaloni", "geaca", "rochie", "bluza", "tricou", "costum"],
  "incaltaminte": ["tenisi", "ghete", "cizme", "sandale", "pantofi"],
  "genti-accesorii": ["geanta", "portofel", "curea", "esarf"],
};

/** Level4 slugs: doar pentru terenuri și exec-imobiliare – Terenuri (generic) / Intravilan / Extravilan. */
export const RO_LEVEL4_BY_SUBCATEGORY: Record<string, string[]> = {
  "terenuri": ["terenuri", "intravilan", "extravilan"],
  "exec-imobiliare": ["terenuri", "intravilan", "extravilan"],
};

export const RO_LEVEL4_LABELS: Record<string, string> = {
  terenuri: "Terenuri",
  intravilan: "Intravilan",
  extravilan: "Extravilan",
};

export type RoTaxonomyCategory = keyof typeof RO_CATEGORIES;
export type RoTaxonomySubcategory = string;
export type RoTaxonomyLevel3 = string;

/** Full taxonomy shape for engine/apply: category -> subcategories -> level3[] */
export interface RO_TAXONOMY_SHAPE {
  categories: Record<
    string,
    {
      name: string;
      subcategories: Record<string, { name: string; level3?: string[] }>;
    }
  >;
}

function buildTaxonomyShape(): RO_TAXONOMY_SHAPE {
  const categories: RO_TAXONOMY_SHAPE["categories"] = {};
  for (const [catSlug, entry] of Object.entries(RO_CATEGORIES)) {
    if (catSlug === "all") continue;
    const subcategories: Record<string, { name: string; level3?: string[] }> = {};
    for (const subSlug of entry.subcategories) {
      subcategories[subSlug] = {
        name: RO_SUBCATEGORY_NAMES[subSlug] ?? subSlug,
        level3: RO_LEVEL3_BY_SUBCATEGORY[subSlug],
      };
    }
    categories[catSlug] = { name: entry.name, subcategories };
  }
  return { categories };
}

/** Single source of truth: categories -> subcategories -> level3 (where defined). */
export const RO_TAXONOMY = buildTaxonomyShape();

export function getLevel3ForSubcategory(subcategorySlug: string): string[] {
  return RO_LEVEL3_BY_SUBCATEGORY[subcategorySlug] ?? [];
}

export function isLevel3Valid(categorySlug: string, subcategorySlug: string, level3Slug: string): boolean {
  const list = RO_LEVEL3_BY_SUBCATEGORY[subcategorySlug];
  if (!list) return false;
  return list.includes(level3Slug);
}

export function getLevel4ForSubcategory(subcategorySlug: string): string[] {
  return RO_LEVEL4_BY_SUBCATEGORY[subcategorySlug] ?? [];
}

export function isLevel4Valid(subcategorySlug: string, level4Slug: string): boolean {
  const list = RO_LEVEL4_BY_SUBCATEGORY[subcategorySlug];
  if (!list) return false;
  return list.includes(level4Slug);
}
