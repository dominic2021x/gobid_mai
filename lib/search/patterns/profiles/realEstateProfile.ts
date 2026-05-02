import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "category",
  "subcategory",
  "category_attribute",
  "category_attribute_geo",
  "geo_only",
  "mixed",
];

const PREFERRED: PatternType[] = [
  "category",
  "subcategory",
  "category_attribute",
  "category_attribute_geo",
  "geo_only",
];

const WEAK_LAST = new Set([
  "lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze",
]);

const INVALID = new Set(["vanzare", "info", "detalii", "poze"]);

const HIGH_VALUE = new Set([
  "camere", "cam", "ha", "mp", "m2", "extravilan", "intravilan", "comercial", "rezidential",
]);

export function getRealEstateProfile(): PatternProfile {
  return {
    vertical: "real_estate",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.45,
    allowMixed: true,
  };
}
