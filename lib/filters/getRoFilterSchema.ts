/**
 * Single source of truth for RO filter schema.
 * Used by /api/admin/recategorizare/filters, /ro (via re-exports), and /admin/recategorizare.
 * No duplication: all data comes from lib/data/ro-categories and lib/taxonomy/ro.
 */

import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import {
  RO_LEVEL3_BY_SUBCATEGORY,
  RO_LEVEL4_BY_SUBCATEGORY,
  RO_LEVEL4_LABELS,
  PIESE_AUTO_LEVEL3_LABELS,
} from "@/lib/taxonomy/ro/taxonomy";
import {
  AUTO_FUEL,
  AUTO_BODY_TYPE,
  AUTO_PART_TYPE,
  FASHION_DEPARTMENT,
  FASHION_APPAREL_TYPE,
  FASHION_FOOTWEAR_TYPE,
  FASHION_ACCESSORY_TYPE,
} from "@/lib/taxonomy/ro/attributes";
import type { RoFilterSchema } from "./filters.types";

/**
 * Canonical list_category options for Executări "Mai multe detalii" – 1:1 cu /ro (ordine și etichete).
 * Pe /ro opțiunile apar și din date (executariListCategoryOptions); aici e sursa canonică pentru admin.
 */
export const EXEC_MAI_MULTE_DETALII_OPTIONS = [
  "Altele",
  "Apartamente si case",
  "executari-publice",
  "oferte-grupate",
  "Spatii comerciale",
  "Teren cu cladire",
  "Terenuri",
] as const;

/** @deprecated Use EXEC_MAI_MULTE_DETALII_OPTIONS for full list. Kept for backward compat. */
export const EXEC_LIST_CATEGORY_OPTIONS = ["Terenuri"] as const;

/** Tip teren options shown on /ro and admin (Agricol hidden in UI; kept in taxonomy). */
export const TIP_TEREN_VISIBLE_SLUGS = ["terenuri-intravilane", "terenuri-extravilane"] as const;

/** Canonical short labels for Tip teren (1:1 with /ro; no legacy "Terenuri intravilane"). */
export const TIP_TEREN_LABELS: Record<string, string> = {
  "terenuri-intravilane": "Intravilan",
  "terenuri-extravilane": "Extravilan",
};

const FIELDS_BY_SUBCATEGORY: Record<string, { productFields: string[]; attributeKeys: string[] }> = {
  terenuri: { productFields: [], attributeKeys: [] },
  "exec-imobiliare": { productFields: [], attributeKeys: [] },
  apartamente: { productFields: ["brand"], attributeKeys: [] },
  "case-vile": { productFields: ["brand"], attributeKeys: [] },
  autoturisme: { productFields: ["brand", "model", "condition"], attributeKeys: ["fuel", "bodyType"] },
  "suv-4x4": { productFields: ["brand", "model", "condition"], attributeKeys: ["fuel", "bodyType"] },
  "piese-auto": { productFields: ["brand", "model"], attributeKeys: ["partType"] },
  motociclete: { productFields: ["brand", "model", "condition"], attributeKeys: [] },
  "haine-designer": { productFields: ["brand", "size", "color", "condition"], attributeKeys: ["department", "apparelType"] },
  incaltaminte: { productFields: ["brand", "size", "color", "condition"], attributeKeys: ["footwearType"] },
  "genti-accesorii": { productFields: ["brand", "color", "condition"], attributeKeys: ["accessoryType"] },
  "parfumuri-cosmetice": { productFields: ["brand", "condition"], attributeKeys: [] },
  "ceasuri-lux": { productFields: ["brand", "model", "condition"], attributeKeys: [] },
};

/**
 * Build the canonical RO filter schema. Used by API and by pages that need filter options.
 * Caching: callers may wrap with unstable_cache if needed; this function is pure.
 */
export function getRoFilterSchema(): RoFilterSchema {
  const categories = Object.entries(RO_CATEGORIES)
    .filter(([slug]) => slug !== "all")
    .map(([slug, entry]) => ({
      slug,
      name: entry.name,
      subcategories: entry.subcategories,
    }));

  return {
    categories,
    subcategoryNames: { ...RO_SUBCATEGORY_NAMES },
    level3BySubcategory: { ...RO_LEVEL3_BY_SUBCATEGORY },
    level3LabelsBySubcategory: {
      "piese-auto": { ...PIESE_AUTO_LEVEL3_LABELS },
    },
    level4BySubcategory: { ...RO_LEVEL4_BY_SUBCATEGORY },
    level4Labels: { ...RO_LEVEL4_LABELS },
    attributeOptions: {
      fuel: [...AUTO_FUEL],
      bodyType: [...AUTO_BODY_TYPE],
      partType: [...AUTO_PART_TYPE],
      department: [...FASHION_DEPARTMENT],
      apparelType: [...FASHION_APPAREL_TYPE],
      footwearType: [...FASHION_FOOTWEAR_TYPE],
      accessoryType: [...FASHION_ACCESSORY_TYPE],
    },
    fieldsBySubcategory: { ...FIELDS_BY_SUBCATEGORY },
  };
}
