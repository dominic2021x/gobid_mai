/**
 * Load marketplace taxonomy from DB with short TTL cache; fallback to in-memory defaults.
 * Serverless-safe: single bounded query batch, merge with buildMarketplaceTaxonomy defaults.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketplaceTaxonomy } from "../buildMarketplaceTaxonomy";
import type { MarketplaceTaxonomy } from "../types";
import { getCachedValue, setCachedValue, CACHE_KEYS } from "./cacheLayer";

type TaxonomyRow = { term_type: string; slug: string; parent_slug: string | null };
type BrandModelRow = { brand_slug: string; model_slug: string | null; vertical: string };

export async function getCachedMarketplaceTaxonomy(
  supabase: SupabaseClient | null
): Promise<MarketplaceTaxonomy> {
  const cached = getCachedValue<MarketplaceTaxonomy>("taxonomy", CACHE_KEYS.TAXONOMY);
  if (cached) return cached;

  if (!supabase) {
    const built = buildMarketplaceTaxonomy();
    setCachedValue("taxonomy", CACHE_KEYS.TAXONOMY, built);
    return built;
  }

  try {
    const [termsRes, brandsRes] = await Promise.all([
      supabase
        .from("search_taxonomy_terms")
        .select("term_type, slug, parent_slug")
        .limit(5000),
      supabase
        .from("search_brand_models")
        .select("brand_slug, model_slug, vertical")
        .limit(5000),
    ]);

    const terms = (termsRes.data ?? []) as TaxonomyRow[];
    const brands = (brandsRes.data ?? []) as BrandModelRow[];

    const categorySlugs: string[] = [];
    const subcategoryByCategory: Array<{ category: string; subcategory: string }> = [];
    const attributeKeys: string[] = [];
    const geoCounties: string[] = [];
    const geoCities: string[] = [];
    for (const t of terms) {
      const slug = (t.slug ?? "").toLowerCase().trim();
      const parent = (t.parent_slug ?? "").toLowerCase().trim();
      if (!slug) continue;
      if (t.term_type === "category") {
        categorySlugs.push(slug);
      } else if (t.term_type === "subcategory" && parent) {
        subcategoryByCategory.push({ category: parent, subcategory: slug });
      } else if (t.term_type === "attribute_key") {
        attributeKeys.push(slug);
      } else if (t.term_type === "geo_county") {
        geoCounties.push(slug);
      } else if (t.term_type === "geo_city") {
        geoCities.push(slug);
      }
    }

    const brandSet = new Set<string>();
    const modelByBrand: Array<{ brand: string; model: string }> = [];
    for (const b of brands) {
      const brand = (b.brand_slug ?? "").toLowerCase().trim();
      const model = (b.model_slug ?? "").toLowerCase().trim();
      if (brand) brandSet.add(brand);
      if (brand && model) modelByBrand.push({ brand, model });
    }

    const opts = {
      categorySlugs: categorySlugs.length > 0 ? categorySlugs : undefined,
      subcategoryByCategory:
        subcategoryByCategory.length > 0 ? subcategoryByCategory : undefined,
      attributeKeys: attributeKeys.length > 0 ? attributeKeys : undefined,
      brands: brandSet.size > 0 ? [...brandSet] : undefined,
      modelByBrand: modelByBrand.length > 0 ? modelByBrand : undefined,
      counties: geoCounties.length > 0 ? geoCounties : undefined,
      cities: geoCities.length > 0 ? geoCities : undefined,
    };

    const built = buildMarketplaceTaxonomy(opts);
    setCachedValue("taxonomy", CACHE_KEYS.TAXONOMY, built);
    return built;
  } catch {
    const built = buildMarketplaceTaxonomy();
    setCachedValue("taxonomy", CACHE_KEYS.TAXONOMY, built);
    return built;
  }
}
