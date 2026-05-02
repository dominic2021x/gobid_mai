import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { inferIntentCategoriesFromQuery } from "@/lib/search/categoryRules";

/**
 * Map normalized query to RO category slug (for demand opportunities).
 * Uses existing intent inference; returns first category or null.
 */
export function mapQueryToCategorySlug(queryNorm: string): string | null {
  if (!queryNorm || !queryNorm.trim()) return null;
  const pairs = inferIntentCategoriesFromQuery(queryNorm);
  const first = pairs[0];
  if (!first || first.categorySlug === "all") return null;
  const slug = first.categorySlug;
  return RO_CATEGORIES[slug] ? slug : null;
}
