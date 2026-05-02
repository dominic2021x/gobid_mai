/**
 * Build marketplace taxonomy for pattern matching.
 * Can be populated from DB (search_taxonomy_terms, search_brand_models, geo) or in-memory defaults.
 * Serverless-safe: pass pre-fetched data or use bounded RPC.
 */

import type { MarketplaceTaxonomy } from "./types";

/** Default category slugs – extend from DB when search_taxonomy_terms exists. */
const DEFAULT_CATEGORY_SLUGS = new Set([
  "imobiliare",
  "autovehicule",
  "executari_insolventa",
  "executari",
  "utilaje",
  "electronice",
  "casa-gradina",
  "agricultura",
  "industria",
  "piese-auto",
  "servicii",
  "altele",
]);

/** Category -> subcategories (subset; extend from DB). */
const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  imobiliare: ["apartamente", "apartament", "case", "terenuri", "spatii-comerciale", "garaje"],
  autovehicule: ["autoturisme", "camioane", "motociclete", "remorci"],
  executari_insolventa: ["executari", "insolventa", "licitatii"],
  utilaje: ["tractoare", "combine", "incarcatoare", "excavatoare"],
  electronice: ["telefoane", "laptopuri", "tv", "electrocasnice"],
  "casa-gradina": ["mobilier", "decoratiuni", "gradina", "scule"],
  agricultura: ["tractoare", "masini-agricole", "echipamente"],
  industria: ["echipamente", "masini-unealta", "materiale"],
};

/** Known brands (auto + electronics + agri – extend from DB). */
const DEFAULT_BRANDS = new Set([
  "audi", "bmw", "dacia", "ford", "iveco", "opel", "volkswagen", "vw", "mercedes",
  "renault", "peugeot", "citroen", "jaguar", "toyota", "honda", "nissan", "skoda",
  "seat", "volvo", "fiat", "porsche", "lexus", "jeep", "mini", "tesla", "cupra",
  "suzuki", "mazda", "hyundai", "kia", "john deere", "case ih", "new holland",
  "apple", "samsung", "xiaomi", "huawei", "iphone",
]);

/** Attribute keys that are high-value for suggestions (rooms, area, etc.). */
const DEFAULT_ATTRIBUTE_KEYS = new Set([
  "camere", "cam", "ha", "mp", "m2", "an", "km", "capacitate", "putere",
  "extravilan", "intravilan", "comercial", "rezidential",
]);

/** Romanian counties (lowercase, no diacritics). */
const DEFAULT_COUNTIES = new Set([
  "alba", "arad", "arges", "bacau", "bihor", "bistrita-nasaud", "botosani",
  "brasov", "braila", "bucuresti", "buzau", "caras-severin", "calarasi",
  "cluj", "constanta", "covasna", "dambovita", "dolj", "galati", "giurgiu",
  "gorj", "harghita", "hunedoara", "ialomita", "iasi", "ilfov", "maramures",
  "mehedinti", "mures", "neamt", "olt", "prahova", "salaj", "satu mare",
  "sibiu", "suceava", "teleorman", "timis", "tulcea", "valcea", "vaslui",
  "vrancea",
]);

/**
 * Build taxonomy from optional DB rows. If no DB data passed, returns in-memory defaults.
 */
export function buildMarketplaceTaxonomy(opts?: {
  categorySlugs?: string[];
  subcategoryByCategory?: Array<{ category: string; subcategory: string }>;
  brands?: string[];
  modelByBrand?: Array<{ brand: string; model: string }>;
  attributeKeys?: string[];
  counties?: string[];
  cities?: string[];
}): MarketplaceTaxonomy {
  const categorySlugs = new Set(opts?.categorySlugs ?? [...DEFAULT_CATEGORY_SLUGS]);
  const subcategoryByCategory = new Map<string, Set<string>>();

  if (opts?.subcategoryByCategory?.length) {
    for (const { category, subcategory } of opts.subcategoryByCategory) {
      const c = category.toLowerCase().trim();
      const s = subcategory.toLowerCase().trim();
      if (!subcategoryByCategory.has(c)) subcategoryByCategory.set(c, new Set());
      subcategoryByCategory.get(c)!.add(s);
    }
  } else {
    for (const [cat, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
      subcategoryByCategory.set(cat, new Set(subs.map((s) => s.toLowerCase())));
    }
  }

  const brandSlugs = new Set(opts?.brands ?? [...DEFAULT_BRANDS]);
  const modelByBrand = new Map<string, Set<string>>();
  if (opts?.modelByBrand?.length) {
    for (const { brand, model } of opts.modelByBrand) {
      const b = brand.toLowerCase().trim();
      const m = model.toLowerCase().trim();
      if (!modelByBrand.has(b)) modelByBrand.set(b, new Set());
      modelByBrand.get(b)!.add(m);
    }
  }

  const attributeKeys = new Set(opts?.attributeKeys ?? [...DEFAULT_ATTRIBUTE_KEYS]);
  const geoCounties = new Set(opts?.counties ?? [...DEFAULT_COUNTIES]);
  const geoCities = new Set(opts?.cities ?? []);

  return {
    categorySlugs,
    subcategoryByCategory,
    brandSlugs,
    modelByBrand,
    attributeKeys,
    geoCounties,
    geoCities,
  };
}
