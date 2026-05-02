import type { PatternProfile, PatternType } from "../types";

const VALID: PatternType[] = [
  "category",
  "subcategory",
  "category_attribute_geo",
  "geo_only",
  "mixed",
];

const PREFERRED: PatternType[] = ["category", "category_attribute_geo", "geo_only"];

const WEAK_LAST = new Set(["lei", "euro", "vanzare", "info", "detalii"]);

const INVALID = new Set(["vanzare", "info", "detalii"]);

const HIGH_VALUE = new Set(["executari", "insolventa", "licitatii"]);

export function getExecutariProfile(): PatternProfile {
  return {
    vertical: "executari",
    validPatternTypes: VALID,
    preferredPatternTypes: PREFERRED,
    invalidTokens: new Set(INVALID),
    weakLastTokens: new Set(WEAK_LAST),
    highValueAttributes: new Set(HIGH_VALUE),
    minPatternScore: 0.4,
    allowMixed: true,
  };
}
