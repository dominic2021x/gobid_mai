/**
 * Shared text normalization for RO categorization and search.
 * Single place for: lowercase, trim, collapse whitespace, strip diacritics.
 * Used by: categorization rules, applyCategoryChange slug comparison, recategorization agent.
 */

import { stripDiacritics } from "@/lib/search/normalize";

/**
 * Normalize text: lowercase, strip diacritics, collapse spaces, trim.
 * Use for title/description matching in rules and recategorization.
 */
export function normalizeRo(text: string): string {
  if (text == null || typeof text !== "string") return "";
  const t = text.trim();
  if (!t) return "";
  return stripDiacritics(t)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Alias for normalizeRo – same behavior (categorization matching).
 */
export function normalizeForCategorization(text: string): string {
  return normalizeRo(text);
}

/**
 * Normalize for slug-style comparison (hyphenated, no spaces).
 * Used when comparing DB category/subcategory to taxonomy slugs.
 */
export function normalizeSlugForCompare(value: string): string {
  if (value == null || typeof value !== "string") return "";
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}
