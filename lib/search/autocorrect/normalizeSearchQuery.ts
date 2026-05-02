/**
 * Normalize search query for autocorrect: diacritics-insensitive, trim, collapse spaces.
 * Reuses roNormalize for consistency with suggest and v2.
 */

import { normalizeRo } from "@/lib/search/roNormalize";

/**
 * Normalize for autocorrect layer (same as search: lowercase, no diacritics, clean).
 */
export function normalizeSearchQuery(input: string): string {
  if (input == null || typeof input !== "string") return "";
  return normalizeRo(input);
}
