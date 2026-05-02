import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "category",
  "subcategory",
  "category_attribute",
  "brand",
  "brand_model",
  "mixed",
];

const PREFERRED: PatternType[] = ["category", "subcategory", "category_attribute"];

const WEAK_LAST = new Set([
  "lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze",
]);

const INVALID = new Set(["vanzare", "info", "detalii", "poze"]);

const HIGH_VALUE = new Set(["mp", "m2", "camere", "cam"]);

export function getHomeGardenProfile(): PatternProfile {
  return {
    vertical: "home_garden",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.4,
    allowMixed: true,
  };
}
