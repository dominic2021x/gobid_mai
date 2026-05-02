/**
 * Deterministic rules for RO land listings: teren intravilan / extravilan / agricol.
 * Used by filters-lab scan (mode=rules) and by cron auto-categorize.
 * All slugs from RO_LAND_TAXONOMY (lib/data/ro-categories.ts).
 * Extravilan is NOT mapped to agricole unless explicit agricultural keywords are present.
 */

import { RO_LAND_TAXONOMY, RO_CATEGORIES } from "@/lib/data/ro-categories";
import { normalizeForCategorization } from "@/lib/text/normalizeRo";

export type LandClassificationResult = {
  category: string;
  subcategory: string;
  level3?: string;
  confidence: 1;
  reason: string;
};

/** Ensure land subcategory and level3 slugs exist in taxonomy; if not, return null (fail safe). */
function landSlugsValid(): boolean {
  const cat = RO_CATEGORIES[RO_LAND_TAXONOMY.category];
  return Boolean(
    cat?.subcategories?.includes(RO_LAND_TAXONOMY.subcategory) &&
      (RO_LAND_TAXONOMY.level3Intravilan &&
        RO_LAND_TAXONOMY.level3Extravilan &&
        RO_LAND_TAXONOMY.level3Agricol)
  );
}

/** Sports/play contexts: do not classify as land. Normalized (lowercase, no diacritics, collapsed ws). */
const EXCLUSION_PHRASES = [
  "teren de joaca",
  "teren de joc",
  "teren sport",
  "teren de sport",
  "teren fotbal",
  "teren tenis",
  "teren baschet",
];

function isExcluded(normalized: string): boolean {
  for (const phrase of EXCLUSION_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }
  return false;
}

/** Agricultural keywords: only then we map to terenuri-agricole. */
const AGRICULTURAL_KEYWORDS = ["agricol", "arabil", "pasune", "faneata", "livada", "vie"];

function hasAgriculturalKeyword(normalized: string): boolean {
  return AGRICULTURAL_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Classify land listings. Deterministic, no ambiguity scoring.
 * - Intravilan: teren + intravilan → terenuri-intravilane
 * - Extravilan: teren + extravilan → terenuri-extravilane (NOT agricole)
 * - Agricole: ONLY teren + (agricol | arabil | pasune | faneata | livada | vie) → terenuri-agricole
 */
export function classifyLandRO(input: {
  title: string;
  description?: string;
  currentCategory?: string;
  currentSubcategory?: string;
}): LandClassificationResult | null {
  if (!landSlugsValid()) return null;

  const combined = `${input.title || ""} ${input.description || ""}`.trim();
  const n = normalizeForCategorization(combined);
  if (!n) return null;

  if (!n.includes("teren")) return null;
  if (isExcluded(n)) return null;

  // 1) Agricole: only when explicit agricultural keywords present
  if (hasAgriculturalKeyword(n)) {
    return {
      category: RO_LAND_TAXONOMY.category,
      subcategory: RO_LAND_TAXONOMY.subcategory,
      level3: RO_LAND_TAXONOMY.level3Agricol,
      confidence: 1,
      reason: "teren + termeni agricoli → terenuri agricole",
    };
  }

  // 2) Intravilan
  if (n.includes("intravilan")) {
    return {
      category: RO_LAND_TAXONOMY.category,
      subcategory: RO_LAND_TAXONOMY.subcategory,
      level3: RO_LAND_TAXONOMY.level3Intravilan,
      confidence: 1,
      reason: "teren + intravilan → terenuri intravilane",
    };
  }

  // 3) Extravilan (generic; not agricole unless keywords above)
  if (n.includes("extravilan")) {
    return {
      category: RO_LAND_TAXONOMY.category,
      subcategory: RO_LAND_TAXONOMY.subcategory,
      level3: RO_LAND_TAXONOMY.level3Extravilan,
      confidence: 1,
      reason: "teren + extravilan → terenuri extravilane",
    };
  }

  return null;
}
