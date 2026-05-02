import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "brand",
  "brand_model",
  "brand_model_variant",
  "brand_model_geo",
  "category",
  "subcategory",
  "mixed",
];

const PREFERRED: PatternType[] = ["brand", "brand_model", "brand_model_variant"];

const WEAK_LAST = new Set([
  "km", "an", "ani", "lei", "euro", "vanzare", "manual", "diesel", "benzina", "automat",
  "fab", "barca", "aparate", "aparat", "sudura", "lipit", "pian",
]);

const INVALID = new Set(["vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit"]);

const HIGH_VALUE = new Set(["km", "an", "capacitate", "putere"]);

export function getAutoProfile(): PatternProfile {
  return {
    vertical: "auto",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.45,
    allowMixed: false,
  };
}
