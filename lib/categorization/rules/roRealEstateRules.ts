/**
 * Real-estate rule pack: land (teren intravilan/extravilan/agricol). Delegates to classifyLandRO.
 * Returns engine-shaped ClassificationResult; attributes empty for real-estate in Phase 1.
 */

import type { ClassificationInput, ClassificationResult } from "@/lib/categorization/engine";
import { classifyLandRO } from "@/lib/categorization/rules/roLandRules";

export function classifyRealEstate(input: ClassificationInput): ClassificationResult {
  const land = classifyLandRO({
    title: input.title,
    description: input.description,
    currentCategory: input.currentCategory,
    currentSubcategory: input.currentSubcategory,
  });
  if (!land) return null;
  return {
    categorySlug: land.category,
    subcategorySlug: land.subcategory,
    level3Slug: land.level3,
    attributes: {},
    confidence: land.confidence,
    reason: land.reason,
    source: "rules",
  };
}
