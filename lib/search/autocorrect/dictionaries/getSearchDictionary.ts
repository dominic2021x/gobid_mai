/**
 * Build search dictionary (categories, subcategories, attributes) from taxonomy.
 * Used for typo correction; reuse cached taxonomy from pattern engine.
 */

import type { MarketplaceTaxonomy } from "@/lib/search/patterns/types";
import type { SearchDictionary } from "../types";

export function getSearchDictionary(taxonomy: MarketplaceTaxonomy): SearchDictionary {
  const categories = new Set(taxonomy.categorySlugs);
  const subcategories = new Set<string>();
  for (const subs of taxonomy.subcategoryByCategory.values()) {
    for (const s of subs) subcategories.add(s);
  }
  const attributes = new Set(taxonomy.attributeKeys);
  const all = new Set<string>([...categories, ...subcategories, ...attributes]);
  return { categories, subcategories, attributes, all };
}
