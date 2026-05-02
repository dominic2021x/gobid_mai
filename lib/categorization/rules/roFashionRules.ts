/**
 * Fashion rule pack: moda category, subcategory (haine-designer, incaltaminte, genti-accesorii), attributes.
 * Confidence=1 only on clear keyword match.
 */

import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { normalizeForCategorization } from "@/lib/text/normalizeRo";
import type { ProductAttributes } from "@/lib/taxonomy/ro/attributes";
import {
  FASHION_APPAREL_SYNONYMS,
  FASHION_FOOTWEAR_SYNONYMS,
  FASHION_ACCESSORY_SYNONYMS,
  FASHION_DEPARTMENT_SYNONYMS,
} from "@/lib/taxonomy/ro/dictionaries/fashion";
import type { ClassificationInput, ClassificationResult } from "@/lib/categorization/engine";

const CATEGORY_MODA = "moda";
const SUBCATS = RO_CATEGORIES[CATEGORY_MODA]?.subcategories ?? [];
const SET_SUBCATS = new Set(SUBCATS);

function matchSubcategory(n: string): string | null {
  if (n.includes("geanta") || n.includes("portofel") || n.includes("curea") || n.includes("esarf") || n.includes("accesorii")) return "genti-accesorii";
  if (n.includes("incaltaminte") || n.includes("tenisi") || n.includes("ghete") || n.includes("cizme") || n.includes("pantofi") || n.includes("sandale")) return "incaltaminte";
  if (n.includes("pantaloni") || n.includes("geaca") || n.includes("rochie") || n.includes("bluza") || n.includes("tricou") || n.includes("haine") || n.includes("blugi")) return "haine-designer";
  if (n.includes("parfum") || n.includes("cosmetice")) return "parfumuri-cosmetice";
  if (n.includes("ceas")) return "ceasuri-lux";
  return null;
}

function extractAttributes(n: string, sub: string): ProductAttributes {
  const attrs: ProductAttributes = {};
  for (const [kw, slug] of Object.entries(FASHION_DEPARTMENT_SYNONYMS)) {
    if (n.includes(kw)) { attrs.department = slug; break; }
  }
  if (sub === "haine-designer") {
    for (const [kw, slug] of Object.entries(FASHION_APPAREL_SYNONYMS)) {
      if (n.includes(kw)) { attrs.apparelType = slug; break; }
    }
  }
  if (sub === "incaltaminte") {
    for (const [kw, slug] of Object.entries(FASHION_FOOTWEAR_SYNONYMS)) {
      if (n.includes(kw)) { attrs.footwearType = slug; break; }
    }
  }
  if (sub === "genti-accesorii") {
    for (const [kw, slug] of Object.entries(FASHION_ACCESSORY_SYNONYMS)) {
      if (n.includes(kw)) { attrs.accessoryType = slug; break; }
    }
  }
  return attrs;
}

export function classifyFashion(input: ClassificationInput): ClassificationResult {
  const combined = `${input.title || ""} ${input.description || ""}`.trim();
  const n = normalizeForCategorization(combined);
  if (!n) return null;

  const sub = matchSubcategory(n);
  if (!sub || !SET_SUBCATS.has(sub)) return null;

  const attributes = extractAttributes(n, sub);
  const confidence = (n.includes("geanta") || n.includes("pantaloni") || n.includes("tenisi") || n.includes("ghete") || n.includes("rochie") || n.includes("haine")) ? 1 : 0.8;
  return {
    categorySlug: CATEGORY_MODA,
    subcategorySlug: sub,
    attributes,
    confidence,
    reason: `fashion rules: ${sub}`,
    source: "rules",
  };
}
