/**
 * Resolve pattern profile with fallback: subcategory -> vertical -> universal.
 */

import type { PatternProfile } from "../types";
import { getProfileForVertical } from "./getProfileForVertical";
import { getSubcategoryProfile } from "./subcategoryProfiles";

/**
 * Get the best matching profile for category + subcategory.
 * Uses subcategory-specific profile when available, else vertical (category) profile.
 */
export function getProfileForSubcategory(
  categorySlug: string | null | undefined,
  subcategorySlug: string | null | undefined
): PatternProfile {
  if (subcategorySlug?.trim()) {
    const sub = getSubcategoryProfile(subcategorySlug.trim());
    if (sub) return sub;
  }
  return getProfileForVertical(categorySlug ?? null);
}
