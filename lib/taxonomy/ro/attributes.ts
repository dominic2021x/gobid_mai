/**
 * Canonical attribute enums for filtering and categorization.
 * Keys/values are stored in products.attributes JSONB and used by /api/ro/listings filters.
 */

/** Auto: fuel type */
export const AUTO_FUEL = [
  "benzina",
  "diesel",
  "electric",
  "hybrid",
  "gpl",
] as const;
export type AutoFuel = (typeof AUTO_FUEL)[number];

/** Auto: body type */
export const AUTO_BODY_TYPE = [
  "berlina",
  "suv",
  "break",
  "hatchback",
  "coupe",
  "cabrio",
  "van",
  "minivan",
  "pickup",
  "camion",
] as const;
export type AutoBodyType = (typeof AUTO_BODY_TYPE)[number];

/** Auto: part type (piese-auto subcategory) */
export const AUTO_PART_TYPE = [
  "piese",
  "anvelope",
  "jante",
  "ulei",
  "baterie",
  "filtre",
  "franare",
  "directie",
  "motor",
] as const;
export type AutoPartType = (typeof AUTO_PART_TYPE)[number];

/** Fashion: department */
export const FASHION_DEPARTMENT = ["barbati", "femei", "copii"] as const;
export type FashionDepartment = (typeof FASHION_DEPARTMENT)[number];

/** Fashion: apparel type */
export const FASHION_APPAREL_TYPE = [
  "pantaloni",
  "geaca",
  "rochie",
  "bluza",
  "tricou",
  "costum",
] as const;
export type FashionApparelType = (typeof FASHION_APPAREL_TYPE)[number];

/** Fashion: footwear type */
export const FASHION_FOOTWEAR_TYPE = ["tenisi", "ghete", "cizme", "sandale", "pantofi"] as const;
export type FashionFootwearType = (typeof FASHION_FOOTWEAR_TYPE)[number];

/** Fashion: accessory type */
export const FASHION_ACCESSORY_TYPE = ["geanta", "portofel", "curea", "esarf"] as const;
export type FashionAccessoryType = (typeof FASHION_ACCESSORY_TYPE)[number];

/** All attribute keys used in products.attributes (canonical, queryable). */
export const ATTRIBUTE_KEYS = [
  "fuel",
  "bodyType",
  "partType",
  "department",
  "apparelType",
  "footwearType",
  "accessoryType",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type ProductAttributes = Partial<{
  fuel: AutoFuel;
  bodyType: AutoBodyType;
  partType: AutoPartType;
  department: FashionDepartment;
  apparelType: FashionApparelType;
  footwearType: FashionFootwearType;
  accessoryType: FashionAccessoryType;
}>;

export const AUTO_ATTRIBUTE_KEYS: AttributeKey[] = ["fuel", "bodyType", "partType"];
export const FASHION_ATTRIBUTE_KEYS: AttributeKey[] = ["department", "apparelType", "footwearType", "accessoryType"];
