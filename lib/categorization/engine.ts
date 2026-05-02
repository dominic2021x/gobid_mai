/**
 * Enterprise categorization engine. Dictionary-driven; deterministic rules first.
 * 1) Legacy mapping: exec-* subcategory -> real taxonomy (imobiliare/autovehicule/etc.).
 * 2) Keyword dictionaries per category. Returns confidence=1 only when match is clear.
 */

import type { ProductAttributes } from "@/lib/taxonomy/ro/attributes";
import { normalizeForCategorization } from "@/lib/text/normalizeRo";
import {
  isValidCategory,
  isValidSubcategory,
  isLevel3Valid,
} from "@/lib/taxonomy/ro";
import {
  mapLegacyExecSubcategoryToTaxonomy,
  isLegacyExecSubcategory,
} from "@/lib/categorization/taxonomy";
import type { DictionaryEntry } from "@/lib/categorization/dictionaries/types";
import { ALL_DICTIONARY_ENTRIES } from "@/lib/categorization/dictionaries/ro";
import { extractBrandModel } from "@/lib/categorization/brandModelExtraction";

export type ClassificationSource = "rules" | "ai" | "admin";

export type ClassificationInput = {
  id?: string;
  title: string;
  description?: string;
  currentCategory?: string;
  currentSubcategory?: string;
  currentLevel3?: string;
  brand?: string;
  model?: string;
  custom_fields?: Record<string, unknown>;
  sourceType?: string;
};

export type ClassificationResult = {
  categorySlug: string;
  subcategorySlug: string;
  level3Slug?: string;
  attributes: ProductAttributes;
  brand?: string;
  model?: string;
  confidence: number;
  reason: string;
  source: ClassificationSource;
} | null;

/** True if normalized text contains keyword as whole word (or phrase). */
function containsWord(normalized: string, keyword: string): boolean {
  const n = normalizeForCategorization(keyword);
  if (!n) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`, "i");
  return re.test(normalized);
}

function entryMatches(entry: DictionaryEntry, normalized: string): boolean {
  const { includeAny, includeAll, excludeAny } = entry;
  if (excludeAny?.length) {
    for (const w of excludeAny) {
      if (containsWord(normalized, w)) return false;
    }
  }
  if (includeAny.length === 0 && !includeAll?.length) return false;
  if (includeAll?.length) {
    for (const w of includeAll) {
      if (!containsWord(normalized, w)) return false;
    }
  }
  let anyMatch = false;
  for (const w of includeAny) {
    if (containsWord(normalized, w)) {
      anyMatch = true;
      break;
    }
  }
  return anyMatch;
}

function validateTarget(entry: DictionaryEntry): boolean {
  const { categorySlug, subcategorySlug, level3Slug } = entry.target;
  if (!isValidCategory(categorySlug)) return false;
  if (!isValidSubcategory(categorySlug, subcategorySlug)) return false;
  if (level3Slug != null && level3Slug !== "" && !isLevel3Valid(categorySlug, subcategorySlug, level3Slug))
    return false;
  return true;
}

/** Build ProductAttributes from entry.attributes (Record<string, string>) for known keys. */
function toProductAttributes(attrs?: Record<string, string>): ProductAttributes {
  if (!attrs || Object.keys(attrs).length === 0) return {};
  return { ...attrs } as ProductAttributes;
}

/** Minimum confidence to return a result (otherwise null). Use 1 for auto-apply; cron may use lower for suggestions. */
const MIN_CONFIDENCE_TO_RETURN = 0.9;

/**
 * Run deterministic classification. Returns best match (valid taxonomy) or null.
 * 1) Legacy: if current subcategory is exec-*, map to real taxonomy and return confidence=1.
 * 2) Dictionary: keyword match; return only when confidence >= MIN_CONFIDENCE_TO_RETURN.
 */
export function classify(input: ClassificationInput): ClassificationResult {
  const text = `${input.title || ""} ${input.description || ""}`.trim();
  const normalized = normalizeForCategorization(text);
  if (!normalized) return null;

  const currentSub = (input.currentSubcategory ?? "").trim().toLowerCase();
  if (currentSub && isLegacyExecSubcategory(currentSub)) {
    const mapped = mapLegacyExecSubcategoryToTaxonomy(currentSub);
    if (mapped) {
      const brandModel = extractBrandModel(input.title, input.description ?? "");
      return {
        categorySlug: mapped.categorySlug,
        subcategorySlug: mapped.subcategorySlug,
        attributes: {},
        brand: brandModel.brand,
        model: brandModel.model,
        confidence: 1,
        reason: "legacy exec mapping",
        source: "rules",
      };
    }
  }

  let best: { entry: DictionaryEntry; specificity: number } | null = null;

  for (const entry of ALL_DICTIONARY_ENTRIES) {
    if (!entry.includeAny?.length && !entry.includeAll?.length) continue;
    if (!validateTarget(entry)) continue;
    if (!entryMatches(entry, normalized)) continue;

    const hasIncludeAll = (entry.includeAll?.length ?? 0) > 0;
    const specificity = hasIncludeAll ? 2 : 1;

    if (
      !best ||
      entry.confidence > best.entry.confidence ||
      (entry.confidence === best.entry.confidence && specificity > best.specificity)
    ) {
      best = { entry, specificity };
    }
  }

  if (!best) return null;

  const { entry } = best;
  if (entry.confidence < MIN_CONFIDENCE_TO_RETURN) return null;

  const brandModel = extractBrandModel(input.title, input.description ?? "");

  return {
    categorySlug: entry.target.categorySlug,
    subcategorySlug: entry.target.subcategorySlug,
    level3Slug: entry.target.level3Slug,
    attributes: toProductAttributes(entry.attributes),
    brand: brandModel.brand,
    model: brandModel.model,
    confidence: entry.confidence,
    reason: entry.reason,
    source: "rules",
  };
}
