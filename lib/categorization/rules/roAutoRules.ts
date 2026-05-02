/**
 * Auto rule pack: autovehicule category, subcategory (autoturisme, piese-auto, etc.), attributes (fuel, bodyType, partType).
 * Confidence=1 only on clear keyword match.
 */

import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { normalizeForCategorization } from "@/lib/text/normalizeRo";
import type { ProductAttributes } from "@/lib/taxonomy/ro/attributes";
import { FUEL_SYNONYMS } from "@/lib/taxonomy/ro/dictionaries/fuel";
import { BODY_TYPE_SYNONYMS } from "@/lib/taxonomy/ro/dictionaries/bodyType";
import type { ClassificationInput, ClassificationResult } from "@/lib/categorization/engine";

const CATEGORY_AUTO = "autovehicule";
const SUBCATS = RO_CATEGORIES[CATEGORY_AUTO]?.subcategories ?? [];
const SET_SUBCATS = new Set(SUBCATS);

function matchSubcategory(n: string): string | null {
  if (n.includes("piese") || n.includes("anvelope") || n.includes("jante") || n.includes("roti")) return "piese-auto";
  if (n.includes("camion") || n.includes("tir") || n.includes("truck")) return "camioane";
  if (n.includes("remorca") || n.includes("semiremorca")) return "remorci";
  if (n.includes("autorulota") || n.includes("rulota") || n.includes("caravana")) return "autorulote";
  if (n.includes("motocicleta") || n.includes("scuter") || n.includes("atv")) return "motociclete";
  if (n.includes("electric") && (n.includes("masina") || n.includes("auto") || n.includes("vehicul"))) return "vehicule-electrice";
  if (n.includes("suv") || n.includes("4x4") || n.includes("offroad")) return "suv-4x4";
  if (
    n.includes("masina") || n.includes("autoturism") || n.includes("automobil") ||
    n.includes("berlina") || n.includes("break") || n.includes("hatchback") ||
    n.includes("diesel") || n.includes("benzina")
  ) return "autoturisme";
  return null;
}

function extractFuel(n: string): ProductAttributes["fuel"] {
  for (const [kw, slug] of Object.entries(FUEL_SYNONYMS)) {
    if (n.includes(kw)) return slug;
  }
  return undefined;
}

function extractBodyType(n: string): ProductAttributes["bodyType"] {
  for (const [kw, slug] of Object.entries(BODY_TYPE_SYNONYMS)) {
    if (n.includes(kw)) return slug;
  }
  return undefined;
}

function extractPartType(n: string): ProductAttributes["partType"] {
  if (n.includes("anvelope") || n.includes("cauciuc")) return "anvelope";
  if (n.includes("jante") || n.includes("roti")) return "jante";
  if (n.includes("ulei")) return "ulei";
  if (n.includes("baterie")) return "baterie";
  if (n.includes("filtre")) return "filtre";
  if (n.includes("frana") || n.includes("franare")) return "franare";
  if (n.includes("directie")) return "directie";
  if (n.includes("motor") && (n.includes("piese") || n.includes("parte"))) return "motor";
  if (n.includes("piese")) return "piese";
  return undefined;
}

export function classifyAuto(input: ClassificationInput): ClassificationResult {
  const combined = `${input.title || ""} ${input.description || ""}`.trim();
  const n = normalizeForCategorization(combined);
  if (!n) return null;

  const sub = matchSubcategory(n);
  if (!sub || !SET_SUBCATS.has(sub)) return null;

  const attributes: ProductAttributes = {};
  const fuel = extractFuel(n);
  if (fuel) attributes.fuel = fuel;
  const bodyType = extractBodyType(n);
  if (bodyType) attributes.bodyType = bodyType;
  if (sub === "piese-auto") {
    const partType = extractPartType(n);
    if (partType) attributes.partType = partType;
  }

  const confidence = (sub === "autoturisme" || sub === "suv-4x4" || sub === "piese-auto") && (n.includes("auto") || n.includes("masina") || n.includes("piese") || n.includes("anvelope") || n.includes("suv") || n.includes("diesel") || n.includes("benzina")) ? 1 : 0.85;
  return {
    categorySlug: CATEGORY_AUTO,
    subcategorySlug: sub,
    attributes,
    confidence,
    reason: `auto rules: ${sub}`,
    source: "rules",
  };
}
