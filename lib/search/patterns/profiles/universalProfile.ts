/**
 * Universal pattern profile – fallback for any category.
 * Valid patterns and weak/invalid tokens for marketplace-wide use.
 */

import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "category",
  "subcategory",
  "brand",
  "brand_model",
  "brand_model_variant",
  "category_attribute",
  "category_attribute_geo",
  "brand_model_geo",
  "geo_only",
  "mixed",
];

const PREFERRED: PatternType[] = [
  "category",
  "subcategory",
  "brand",
  "brand_model",
  "category_attribute",
  "geo_only",
];

const WEAK_LAST = new Set([
  "km", "an", "ani", "lei", "leu", "ron", "euro", "eur", "roni",
  "vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit", "pian",
  "manual", "diesel", "benzina", "benzina", "automat", "pret", "preț",
  "info", "detalii", "poze",
]);

const INVALID = new Set([
  "vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit",
  "info", "detalii", "poze",
]);

const HIGH_VALUE_ATTR = new Set([
  "camere", "cam", "ha", "mp", "m2", "extravilan", "intravilan",
  "comercial", "rezidential", "capacitate", "putere",
]);

export function getUniversalProfile(): PatternProfile {
  return {
    vertical: "universal",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE_ATTR),
    minPatternScore: 0.4,
    allowMixed: true,
  };
}
