/**
 * Subcategory-specific pattern profiles for finer-grained intelligence.
 * Fallback chain: subcategory profile -> vertical profile -> universal.
 */

import type { PatternProfile, PatternType } from "../types";

function profile(
  vertical: PatternProfile["vertical"],
  valid: PatternType[],
  preferred: PatternType[],
  weakLast: string[],
  invalid: string[],
  highValue: string[],
  minScore: number,
  allowMixed: boolean
): PatternProfile {
  return {
    vertical,
    validPatternTypes: valid,
    preferredPatternTypes: preferred,
    invalidTokens: new Set(invalid),
    weakLastTokens: new Set(weakLast),
    highValueAttributes: new Set(highValue),
    minPatternScore: minScore,
    allowMixed,
  };
}

const SUBCATEGORY_MAP: Record<string, () => PatternProfile> = {
  apartament: () => profile(
    "real_estate",
    ["category", "subcategory", "category_attribute", "category_attribute_geo", "geo_only", "mixed"],
    ["category_attribute", "category_attribute_geo", "subcategory"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze"],
    ["vanzare", "info", "detalii", "poze"],
    ["camere", "cam", "mp", "m2", "comercial", "rezidential"],
    0.5,
    true
  ),
  teren_intravilan: () => profile(
    "real_estate",
    ["category", "subcategory", "category_attribute", "category_attribute_geo", "geo_only", "mixed"],
    ["category_attribute", "category_attribute_geo", "subcategory"],
    ["lei", "euro", "vanzare", "pret", "preț"],
    ["vanzare"],
    ["ha", "mp", "m2", "intravilan"],
    0.5,
    true
  ),
  teren_extravilan: () => profile(
    "real_estate",
    ["category", "subcategory", "category_attribute", "category_attribute_geo", "geo_only", "mixed"],
    ["category_attribute", "category_attribute_geo", "subcategory"],
    ["lei", "euro", "vanzare", "pret", "preț"],
    ["vanzare"],
    ["ha", "mp", "m2", "extravilan"],
    0.5,
    true
  ),
  casa: () => profile(
    "real_estate",
    ["category", "subcategory", "category_attribute", "category_attribute_geo", "geo_only", "mixed"],
    ["subcategory", "category_attribute", "category_attribute_geo"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii"],
    ["vanzare", "info", "detalii"],
    ["camere", "cam", "mp", "m2", "ha"],
    0.45,
    true
  ),
  spatiu_comercial: () => profile(
    "real_estate",
    ["category", "subcategory", "category_attribute", "category_attribute_geo", "geo_only", "mixed"],
    ["subcategory", "category_attribute", "category_attribute_geo"],
    ["lei", "euro", "vanzare", "pret", "preț"],
    ["vanzare"],
    ["mp", "m2", "comercial"],
    0.5,
    true
  ),
  telefon: () => profile(
    "electronics",
    ["brand", "brand_model", "brand_model_variant", "category", "subcategory", "mixed"],
    ["brand", "brand_model", "brand_model_variant"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze", "gb", "tb"],
    ["vanzare", "info", "detalii", "poze"],
    ["gb", "tb", "inch", "5g", "4g"],
    0.5,
    true
  ),
  laptop: () => profile(
    "electronics",
    ["brand", "brand_model", "brand_model_variant", "category", "subcategory", "mixed"],
    ["brand", "brand_model", "brand_model_variant"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "poze", "gb", "tb"],
    ["vanzare", "info", "detalii", "poze"],
    ["gb", "tb", "inch", "ram"],
    0.5,
    true
  ),
  tractor: () => profile(
    "agri_industrial",
    ["brand", "brand_model", "brand_model_variant", "category", "subcategory", "category_attribute", "mixed"],
    ["brand", "brand_model", "category_attribute"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "ore", "ani"],
    ["vanzare", "info", "detalii"],
    ["ha", "putere", "capacitate", "ore", "ani"],
    0.5,
    true
  ),
  buldoexcavator: () => profile(
    "agri_industrial",
    ["brand", "brand_model", "brand_model_variant", "category", "subcategory", "mixed"],
    ["brand", "brand_model"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "ore", "ani"],
    ["vanzare", "info", "detalii"],
    ["putere", "capacitate", "ore"],
    0.5,
    true
  ),
  autoturism: () => profile(
    "auto",
    ["brand", "brand_model", "brand_model_variant", "brand_model_geo", "category", "subcategory", "mixed"],
    ["brand", "brand_model", "brand_model_variant", "brand_model_geo"],
    ["km", "an", "ani", "lei", "euro", "vanzare", "manual", "diesel", "benzina", "automat", "fab", "barca", "aparate", "aparat", "sudura", "lipit", "pian"],
    ["vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit"],
    ["km", "an", "capacitate", "putere"],
    0.5,
    false
  ),
  utilaj_agricol: () => profile(
    "agri_industrial",
    ["brand", "brand_model", "brand_model_variant", "category", "subcategory", "category_attribute", "mixed"],
    ["brand", "brand_model", "category_attribute"],
    ["lei", "euro", "vanzare", "pret", "preț", "info", "detalii", "ore", "ani"],
    ["vanzare", "info", "detalii"],
    ["ha", "putere", "capacitate", "ore", "ani"],
    0.5,
    true
  ),
};

const NORMALIZE_SUBCATEGORY: Record<string, string> = {
  apartamente: "apartament",
  terenuri: "teren_intravilan",
  "spatii-comerciale": "spatiu_comercial",
  "spatiu comercial": "spatiu_comercial",
  telefoane: "telefon",
  laptopuri: "laptop",
  tractoare: "tractor",
  autoturisme: "autoturism",
};

/**
 * Get pattern profile for a subcategory slug, or null if none defined.
 */
export function getSubcategoryProfile(subcategorySlug: string): PatternProfile | null {
  const slug = (subcategorySlug ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  const normalized = NORMALIZE_SUBCATEGORY[slug] ?? slug;
  const fn = SUBCATEGORY_MAP[normalized];
  return fn ? fn() : null;
}
