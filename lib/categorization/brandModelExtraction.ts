/**
 * Deterministic brand/model extraction. Whole-word match against known lists.
 * Used by categorization engine; only set when confident.
 */

import { normalizeForCategorization } from "@/lib/text/normalizeRo";
import { CAR_BRANDS_FULL, PHONE_BRANDS_FULL, MODELS_CARS, MODELS_PHONES } from "@/lib/data/brand-models";

export type BrandModelResult = { brand?: string; model?: string };

const CAR_BRANDS_LOWER = new Map<string, string>(
  CAR_BRANDS_FULL.map((b) => [normalizeForCategorization(b), b])
);
const PHONE_BRANDS_LOWER = new Map<string, string>(
  PHONE_BRANDS_FULL.map((b) => [normalizeForCategorization(b), b])
);

/** Word boundary or non-letter; for whole-word match. */
function asWordPattern(norm: string): RegExp {
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-zăâîșț])${escaped}(?:[^a-zăâîșț]|$)`, "i");
}

/**
 * Detect brand from normalized text (cars then phones). Returns first whole-word match.
 */
function detectBrand(normalized: string): string | undefined {
  const byLength = [...CAR_BRANDS_LOWER.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [key, display] of byLength) {
    if (key.length < 2) continue;
    const re = asWordPattern(key);
    if (re.test(normalized)) return display;
  }
  const byLengthPhone = [...PHONE_BRANDS_LOWER.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [key, display] of byLengthPhone) {
    if (key.length < 2) continue;
    const re = asWordPattern(key);
    if (re.test(normalized)) return display;
  }
  return undefined;
}

/**
 * Detect model for a given brand (whole-word or phrase). Prefer longest match.
 */
function detectModel(normalized: string, brand: string): string | undefined {
  const modelsAuto = MODELS_CARS[brand];
  const modelsPhone = MODELS_PHONES[brand] ?? MODELS_PHONES[brand.replace(/\s+/g, "")];
  const list = modelsAuto ?? modelsPhone;
  if (!list || !Array.isArray(list)) return undefined;

  const normalizedList = list.map((m) => ({ orig: m, norm: normalizeForCategorization(m) }));
  const byLen = normalizedList.filter((m) => m.norm.length >= 2).sort((a, b) => b.norm.length - a.norm.length);

  for (const { orig, norm } of byLen) {
    const re = asWordPattern(norm);
    if (re.test(normalized)) return orig;
  }
  return undefined;
}

/**
 * Extract brand and optionally model from title + description.
 * Only returns when brand is found (whole-word); model only when also found for that brand.
 */
export function extractBrandModel(title: string, description?: string): BrandModelResult {
  const combined = `${title || ""} ${description || ""}`.trim();
  const normalized = normalizeForCategorization(combined);
  if (!normalized) return {};

  const brand = detectBrand(normalized);
  if (!brand) return {};

  const model = detectModel(normalized, brand);
  return model ? { brand, model } : { brand };
}
