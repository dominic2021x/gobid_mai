import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "brand",
  "brand_model",
  "brand_model_variant",
  "category",
  "subcategory",
  "mixed",
];

const PREFERRED: PatternType[] = ["brand", "brand_model", "brand_model_variant", "category"];

const WEAK_LAST = new Set([
  "lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze", "gb", "tb",
]);

const INVALID = new Set(["vanzare", "info", "detalii", "poze"]);

const HIGH_VALUE = new Set(["gb", "tb", "inch", "5g", "4g"]);

export function getElectronicsProfile(): PatternProfile {
  return {
    vertical: "electronics",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.45,
    allowMixed: true,
  };
}
