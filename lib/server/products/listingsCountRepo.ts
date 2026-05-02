/**
 * Server-side strict count for RO listings.
 * Matches the same STRICT filtering as /api/ro/listings first step (no progressive relax).
 * Uses COUNT only – no row fetching. Channel + token gating applied (same as listings).
 */

import { supabaseAdmin } from "@/lib/supabase";
import type { AccessContext } from "@/lib/server/access/resolveAccess";
import { normalizeConditionForForm } from "@/lib/attributes";
import { type ProductQueryStrict, type RoChannel, USE_PRODUCTS_CHANNEL } from "@/lib/server/products/listingsWhere";
import { getPieseAutoCategoryLevel3MatchVariants } from "@/lib/piese-auto/tip-piesa-level3";
import { resolveSellerUserIdsForQuery } from "@/lib/seller/resolveSellerUserIdsForQuery";
import {
  countProductsEnterpriseEstimateMeta,
  countProductsViaEnterpriseRpc,
  type ProductQuery,
  type RoListingsTotalKind,
} from "@/lib/server/products/listingsRepo";

export type { RoListingsTotalKind } from "@/lib/server/products/listingsRepo";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";
import { getExecutariSubcategoryAliases } from "@/lib/listings/executari-canonical-subcategory";
import { stripDiacritics } from "@/lib/search/normalize";
import { qToDistinctSearchTokens } from "@/lib/listings/filters/qSearchTokens";
const DEFAULT_STATUS = ["active", "reserved", "sold", "in_progress"];
const SEARCH_FIELDS = ["title", "category", "subcategory", "category_level_3", "brand", "model", "slug"] as const;
const SEARCH_FIELDS_WITH_TAXONOMY_FILTER = ["title", "category_level_3", "brand", "model", "slug"] as const;
const SEARCH_FIELDS_TITLE_ONLY = ["title"] as const;
const CATEGORY_EXTRA_SUBCATEGORIES: Record<string, string[]> = {
  imobiliare: ["exec-imobiliare"],
  autovehicule: ["exec-autovehicule", "piese-auto"],
  business: ["exec-afaceri", "exec-office"],
  utilaje: ["exec-industrial"],
};
const SUBCATEGORY_EXTRA_SUBCATEGORIES: Record<string, string[]> = {
  autoturisme: ["exec-autovehicule", "piese-auto"],
  "suv-4x4": ["exec-autovehicule", "piese-auto"],
  motociclete: ["exec-autovehicule", "piese-auto"],
  camioane: ["exec-autovehicule", "piese-auto"],
  remorci: ["exec-autovehicule", "piese-auto"],
  "vehicule-electrice": ["exec-autovehicule", "piese-auto"],
  "piese-auto": [],
  "utilaje-constructii": ["exec-industrial"],
  "utilaje-agricole": ["exec-industrial"],
  "echipamente-forestiere": ["exec-industrial"],
  "echipamente-birou": ["exec-office", "exec-afaceri"],
  "mobilier-comercial": ["exec-afaceri"],
};
const TERENURI_SUBCATEGORIES = [
  "terenuri",
  "terenuri-intravilane",
  "terenuri-extravilane",
  "terenuri-agricole",
] as const;
const EXECUTARI_SALE_TYPES = [
  "licitatie-publica",
  "licitatii-insolventa",
  "licitatii-anaf",
  "licitatii-executori",
] as const;

/** Escape ILIKE special chars: % and _ */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Pentru a evita city/county ILIKE dublu când `location` repetă același termen ca `city` sau `county`. */
function locationKeyForDedupe(raw: string): string {
  return stripDiacritics(raw.trim().toLowerCase()).replace(/\s+/g, " ").trim();
}

function getCategoryOrFilter(categories: string[], includeExecutariCrosslist: boolean): string | null {
  const parts: string[] = [];
  for (const cat of categories) {
    if (!cat || cat === "all") continue;
    if (cat === "executari") {
      parts.push(`category.ilike.%executari%,product_type.eq.licitatii-publice,sale_type.in.(${EXECUTARI_SALE_TYPES.join(",")})`);
      continue;
    }
    const extraSubs = includeExecutariCrosslist ? (CATEGORY_EXTRA_SUBCATEGORIES[cat] ?? []) : [];
    parts.push(`category.eq.${cat}`);
    if (extraSubs.length > 0) {
      parts.push(`subcategory.in.(${extraSubs.join(",")})`);
    }
  }
  return parts.length > 0 ? parts.join(",") : null;
}

function getSubcategoryOrFilter(subcategories: string[]): string | null {
  const subs = subcategories.flatMap((sub) => {
    if (!sub || sub === "all") return [];
    const extraSubs = SUBCATEGORY_EXTRA_SUBCATEGORIES[sub] ?? [];
    const execAliases = getExecutariSubcategoryAliases(sub);
    return sub === "terenuri"
      ? [...TERENURI_SUBCATEGORIES, ...extraSubs, ...execAliases]
      : [sub, ...extraSubs, ...execAliases];
  });
  const uniqueSubs = Array.from(new Set(subs));
  if (uniqueSubs.length === 0) return null;
  return uniqueSubs.length === 1
    ? `subcategory.eq.${uniqueSubs[0]},category_level_3.eq.${uniqueSubs[0]}`
    : `subcategory.in.(${uniqueSubs.join(",")}),category_level_3.in.(${uniqueSubs.join(",")})`;
}

/**
 * Return strict total count for the given query.
 * PostgREST / enterprise RPC: același canal + gating ca listările.
 */
export async function countProducts(query: ProductQueryStrict, access?: AccessContext): Promise<number> {
  const resolved = await resolveSellerUserIdsForQuery(query as ProductQuery);
  const channel: RoChannel = (resolved.channel ?? "ro") as RoChannel;
  const scope = resolved.scope ?? "all";
  const categories = (resolved.categories ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const singleCategory = (resolved.categorie ?? "").trim().toLowerCase();
  const categoryFilters = categories.length > 0
    ? Array.from(new Set(categories))
    : singleCategory && singleCategory !== "all"
      ? [singleCategory]
      : [];
  const includeExecutariCrosslist =
    resolved.includeExecutariCrosslist === true ||
    scope === "executari" ||
    channel === "executari_insolventa" ||
    categoryFilters.includes("executari");
  const subcategories = (resolved.subcategories ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const singleSubcategory = (resolved.subcategorie ?? resolved.subcategory ?? "").trim().toLowerCase();
  const subcategoryFilters = subcategories.length > 0
    ? Array.from(new Set(subcategories))
    : singleSubcategory && singleSubcategory !== "all"
      ? [singleSubcategory]
      : [];
  if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access?.hasExecutariAccess) {
    return 0;
  }
  if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return 0;
  }

  if (!supabaseAdmin) {
    if (process.env.DEBUG_LISTINGS_COUNT === "1") {
      // eslint-disable-next-line no-console
      console.warn("[listings-count] Supabase not configured, returning 0");
    }
    return 0;
  }

  const enterpriseTotal = await countProductsViaEnterpriseRpc(resolved, access);
  if (enterpriseTotal !== null) return enterpriseTotal;

  const statusFilter = Array.isArray(resolved.status) && resolved.status.length > 0
    ? resolved.status
    : DEFAULT_STATUS;

  let builder = supabaseAdmin
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("status", statusFilter)
    .neq("status", "deleted")
    .eq("approval_normalized", "approved");
  if (USE_PRODUCTS_CHANNEL) {
    if (scope === "live_bid") {
      builder = builder.eq("channel", "ro");
    } else if (scope === "executari") {
      builder = builder.eq("channel", "executari_insolventa");
    } else if (categoryFilters.includes("executari")) {
      builder = access?.hasExecutariAccess
        ? builder.or("channel.eq.ro,channel.eq.executari_insolventa")
        : builder.eq("channel", "ro");
    } else if (!includeExecutariCrosslist) {
      builder = builder.eq("channel", "ro");
    } else if (channel === "ro") {
      builder = builder.or("channel.eq.ro,channel.eq.executari_insolventa");
    } else {
      builder = builder.eq("channel", channel);
    }
  }

  const su = resolved.seller_user_ids;
  const exclude = resolved.seller_user_ids_exclude === true;
  if (su != null) {
    if (exclude) {
      if (su.length > 0) {
        builder = builder.or(`user_id.is.null,user_id.not.in.(${su.join(",")})`);
      }
    } else if (su.length === 0) {
      return 0;
    } else {
      builder = builder.in("user_id", su);
    }
  }

  const q = (resolved.q ?? "").trim();
  if (q) {
    const words = qToDistinctSearchTokens(q);
    const hasBrandFilter =
      Boolean((resolved.brand ?? "").trim() && (resolved.brand ?? "").trim().toLowerCase() !== "all") ||
      ((resolved.brands?.length ?? 0) > 0);
    const hasTaxonomyFilter = categoryFilters.length > 0 || subcategoryFilters.length > 0;
    const fields = hasBrandFilter
      ? SEARCH_FIELDS_TITLE_ONLY
      : hasTaxonomyFilter
        ? SEARCH_FIELDS_WITH_TAXONOMY_FILTER
        : SEARCH_FIELDS;
    for (const word of words) {
      const escaped = escapeIlike(word);
      const pattern = `%${escaped}%`;
      const orParts = fields.map((f) => `${f}.ilike.${pattern}`).join(",");
      builder = builder.or(orParts);
    }
  }

  const modelVal = (resolved.model ?? "").trim();
  if (modelVal && modelVal !== "all") {
    builder = builder.ilike("model", `%${escapeIlike(modelVal)}%`);
  }

  const categoryOrFilter = getCategoryOrFilter(categoryFilters, includeExecutariCrosslist);
  if (categoryOrFilter) {
    builder = builder.or(categoryOrFilter);
  }

  const subcategoryOrFilter = getSubcategoryOrFilter(subcategoryFilters);
  if (subcategoryOrFilter) {
    builder = builder.or(subcategoryOrFilter);
  }

  const l3List = (resolved.category_level_3s ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const l3single = (resolved.category_level_3 ?? "").trim().toLowerCase();
  if (l3List.length > 0) {
    if (subcategoryFilters.length === 1 && subcategoryFilters[0] === "piese-auto") {
      const allVariants = l3List.flatMap((slug) => getPieseAutoCategoryLevel3MatchVariants(slug));
      const unique = Array.from(new Set(allVariants));
      builder = builder.in("category_level_3", unique);
    } else {
      builder = builder.in("category_level_3", l3List);
    }
  } else if (l3single && l3single !== "all") {
    if (subcategoryFilters.length === 1 && subcategoryFilters[0] === "piese-auto") {
      const variants = getPieseAutoCategoryLevel3MatchVariants(l3single);
      builder = builder.in("category_level_3", variants);
    } else {
      builder = builder.eq("category_level_3", l3single);
    }
  }

  const county = (resolved.county ?? "").trim();
  const city = (resolved.city ?? "").trim();
  const loc = (resolved.location ?? "").trim();
  const locKey = loc ? locationKeyForDedupe(loc) : "";
  const cityKey = city ? locationKeyForDedupe(city) : "";
  const countyKey = county ? locationKeyForDedupe(county) : "";
  const skipCountyStandalone = Boolean(locKey && countyKey && locKey === countyKey);
  const skipCityStandalone = Boolean(locKey && cityKey && locKey === cityKey);

  if (county && !skipCountyStandalone) {
    builder = builder.ilike("county", `%${escapeIlike(county)}%`);
  }

  if (city && !skipCityStandalone) {
    builder = builder.ilike("city", `%${escapeIlike(city)}%`);
  }

  if (loc) {
    const locEsc = escapeIlike(loc);
    builder = builder.ilike("locality_search", `%${locEsc}%`);
  }

  if (resolved.freeOnly === true) {
    builder = builder.or("custom_fields->is_free_listing.eq.true,custom_fields->isFreeListing.eq.true");
  } else {
    if (resolved.price_min != null && !isNaN(resolved.price_min)) {
      builder = builder.gte("starting_price_ron", resolved.price_min);
    }
    if (resolved.price_max != null && !isNaN(resolved.price_max)) {
      builder = builder.lte("starting_price_ron", resolved.price_max);
    }
  }

  const size = (resolved.size ?? "").trim();
  const sizes = resolved.sizes ?? [];
  if (sizes.length > 0) {
    builder = builder.in("size", sizes);
  } else if (size && size !== "all") {
    builder = builder.ilike("size", size);
  }

  const brand = (resolved.brand ?? "").trim();
  const brands = resolved.brands ?? [];
  if (brands.length > 0) {
    const brandOr = brands
      .map((raw) => {
        const escaped = escapeIlike(String(raw ?? "").trim());
        return escaped ? `brand.ilike.%${escaped}%,title.ilike.%${escaped}%` : "";
      })
      .filter(Boolean)
      .join(",");
    if (brandOr) builder = builder.or(brandOr);
  } else if (brand && brand !== "all") {
    const escaped = escapeIlike(brand);
    builder = builder.or(`brand.ilike.%${escaped}%,title.ilike.%${escaped}%`);
  }

  const color = (resolved.color ?? "").trim();
  const colors = resolved.colors ?? [];
  if (colors.length > 0) {
    builder = builder.in("color", colors);
  } else if (color && color !== "all") {
    builder = builder.ilike("color", color);
  }

  const cond = (resolved.condition ?? "").trim();
  const conditionsList = resolved.conditions ?? [];
  const subForCond = (resolved.subcategorie ?? resolved.subcategory ?? "").trim().toLowerCase();
  const rawSelections =
    conditionsList.length > 0 ? conditionsList : cond && cond !== "all" ? [cond] : [];
  if (subForCond === "piese-auto" && rawSelections.length > 0) {
    const normalized = new Set(rawSelections.map((r) => normalizeConditionForForm(r)));
    if (normalized.size < 2) {
      const only = [...normalized][0];
      if (only === "Nou") {
        builder = builder.or("condition.ilike.Nou,condition.ilike.Nouă");
      } else {
        builder = builder.not("condition", "ilike", "Nou").not("condition", "ilike", "Nouă");
      }
    }
  } else if (conditionsList.length > 0) {
    builder = builder.in("condition", conditionsList);
  } else if (cond && cond !== "all") {
    builder = builder.ilike("condition", cond);
  }

  if (resolved.images === "with") {
    builder = builder.not("images", "is", null).not("images", "eq", "[]");
  } else if (resolved.images === "without") {
    builder = builder.or("images.is.null,images.eq.[]");
  }

  const pt = (resolved.product_type ?? "").trim();
  if (pt) {
    builder = builder.eq("product_type", pt);
  }
  const st = (resolved.sale_type ?? "").trim();
  if (st) {
    builder = builder.eq("sale_type", st);
  }

  const attrKeys = ["fuel", "bodyType", "partType", "department", "apparelType", "footwearType", "accessoryType"] as const;
  for (const key of attrKeys) {
    const val = String((resolved as Record<string, string | undefined>)[key] ?? "").trim().toLowerCase();
    if (val && val !== "all") {
      builder = builder.contains("attributes", { [key]: val });
    }
  }

  const { error, count } = await runPostgrestQuery<null>(
    (signal) => builder.abortSignal(signal),
    { timeoutMs: 6500, maxRetries: 0, retryDelayMs: 250 }
  );

  if (error) {
    if (process.env.DEBUG_LISTINGS_COUNT === "1") {
      // eslint-disable-next-line no-console
      console.warn("[listings-count] Supabase count error:", error.message);
    }
    return 0;
  }

  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

/**
 * Prefer enterprise estimate (reltuples / capped 1001); fall back to strict `countProducts`.
 */
export async function countProductsWithEstimateMeta(
  query: ProductQueryStrict | ProductQuery,
  access?: AccessContext,
): Promise<{ total: number; totalKind: RoListingsTotalKind }> {
  const resolved = await resolveSellerUserIdsForQuery(query as ProductQuery);
  const est = await countProductsEnterpriseEstimateMeta(resolved, access);
  if (est) return est;
  const total = await countProducts(query as ProductQueryStrict, access);
  return { total, totalKind: "exact" };
}
