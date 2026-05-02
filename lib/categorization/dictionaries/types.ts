/**
 * Dictionary entry format for taxonomy-driven categorization.
 * Slugs only; validated against RO_CATEGORIES / taxonomy.
 */

export type DictionaryTarget = {
  categorySlug: string;
  subcategorySlug: string;
  level3Slug?: string;
};

export type DictionaryEntry = {
  target: DictionaryTarget;
  /** At least one of these keywords must appear (normalized). */
  includeAny: string[];
  /** All of these must appear (optional; if set, all required). */
  includeAll?: string[];
  /** If any of these appear, entry does not match. */
  excludeAny?: string[];
  /** Level-4 attributes (e.g. fuel=diesel, bodyType=suv). */
  attributes?: Record<string, string>;
  confidence: 1 | 0.92 | 0.9 | 0.88 | 0.85 | 0.75;
  reason: string;
};
