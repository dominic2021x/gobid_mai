/**
 * Build brand/model dictionary from taxonomy.
 */

import type { MarketplaceTaxonomy } from "@/lib/search/patterns/types";
import type { BrandDictionary } from "../types";

export function getBrandDictionary(taxonomy: MarketplaceTaxonomy): BrandDictionary {
  const brands = new Set(taxonomy.brandSlugs);
  const modelByBrand = new Map<string, Set<string>>();
  for (const [brand, models] of taxonomy.modelByBrand) {
    modelByBrand.set(brand, new Set(models));
  }
  const all = new Set<string>(brands);
  for (const models of modelByBrand.values()) {
    for (const m of models) all.add(m);
  }
  return { brands, modelByBrand, all };
}
