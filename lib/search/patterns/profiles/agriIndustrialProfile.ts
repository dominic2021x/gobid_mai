import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "brand",
  "brand_model",
  "brand_model_variant",
  "category",
  "subcategory",
  "category_attribute",
  "mixed",
];

const PREFERRED: PatternType[] = ["brand", "brand_model", "category", "category_attribute"];

const WEAK_LAST = new Set([
  "lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "ore", "ani",
]);

const INVALID = new Set(["vanzare", "info", "detalii"]);

const HIGH_VALUE = new Set(["ha", "putere", "capacitate", "ore", "ani"]);

export function getAgriIndustrialProfile(): PatternProfile {
  return {
    vertical: "agri_industrial",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.45,
    allowMixed: true,
  };
}
