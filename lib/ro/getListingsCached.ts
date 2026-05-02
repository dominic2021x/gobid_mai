/**
 * Server-only cached listings for /ro page. Uses next/cache unstable_cache with revalidate=30.
 * Deterministic cache key from whitelisted params; guardrails: limit cap (MAX_LIMIT), page cap.
 * (No "use server" so sync helpers buildCacheKey/normalizeCategoryTag can be exported; getListingsCached is only called from Server Components.)
 */

import { unstable_cache } from "next/cache";
import { normalizeListingsSearchQText } from "@/lib/listings/filters/qSearchAutocorrect";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import { getRoListings } from "@/lib/ro/listingsRepo";
import type { ProductQuery, RoListingsResult } from "@/lib/ro/listingsRepo";
import { RO_LISTINGS_MAX_PAGE, RO_LISTINGS_PAGE_SIZE_DESKTOP } from "@/lib/ro/roListingsPagination";
import { normalizeRoListingsRawSearchParams } from "./normalizedListingsQuery";
import type { AccessContext } from "@/lib/server/access/resolveAccess";

const CACHE_REVALIDATE_SECONDS = 30;
/** Aliniat cu buildListingsApiParams / route API (cap practic 100). */
const MAX_LIMIT = 100;
const MAX_PAGE = RO_LISTINGS_MAX_PAGE;

export interface ListingsCacheParams {
  q?: string;
  category?: string;
  county?: string;
  city?: string;
  sort?: string;
  page?: number;
  limit?: number;
  scope?: "all" | "live_bid" | "executari";
}

const MAX_Q_LENGTH = 100;

function normalizeQ(value: string | undefined): string {
  if (value == null || typeof value !== "string") return "";
  return normalizeListingsSearchQText(value, MAX_Q_LENGTH);
}

/** Normalized params object for deterministic cache key (JSON.stringify). */
function getNormalizedParams(params: ListingsCacheParams): ListingsCacheParams {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || RO_LISTINGS_PAGE_SIZE_DESKTOP));
  const page = Math.min(MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const q = normalizeQ(params.q) || undefined;
  return {
    q,
    category: (params.category ?? "").trim().toLowerCase() || undefined,
    county: (params.county ?? "").trim().toLowerCase() || undefined,
    city: (params.city ?? "").trim().toLowerCase() || undefined,
    sort: (params.sort ?? "").trim().toLowerCase() || undefined,
    page,
    limit,
    scope: params.scope ?? "all",
  };
}

/** Exported for cache health check (key determinism). */
export function buildCacheKey(params: ListingsCacheParams): string {
  const normalized = getNormalizedParams(params);
  return JSON.stringify(normalized);
}

const MAX_CATEGORY_TAG_LENGTH = 60;

/** Lowercase, trim, slug-safe category for cache tags; max length 60. */
export function normalizeCategoryTag(category: string | undefined | null): string | undefined {
  if (category == null || typeof category !== "string") return undefined;
  const slug = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_CATEGORY_TAG_LENGTH)
    .replace(/-$/, "");
  return slug || undefined;
}

function applyGuardrails(params: ListingsCacheParams): ListingsCacheParams {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || RO_LISTINGS_PAGE_SIZE_DESKTOP));
  const page = Math.min(MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const q = normalizeQ(params.q) || (params.q ?? "").trim().slice(0, MAX_Q_LENGTH) || undefined;
  return {
    ...params,
    q: q || undefined,
    limit,
    page,
  };
}

async function fetchListingsUncached(params: ListingsCacheParams): Promise<RoListingsResult> {
  const { limit = RO_LISTINGS_PAGE_SIZE_DESKTOP, page = 1, scope, q, category, county, city, sort } = params;
  const from = (page - 1) * limit;

  const query: ProductQuery = {
    channel: scope === "executari" ? "executari_insolventa" : "ro",
    scope: scope === "live_bid" || scope === "executari" ? scope : undefined,
    from,
    limit,
    page,
    q: q || undefined,
    categorie: (category ?? "").trim() || undefined,
    county: (county ?? "").trim() || undefined,
    city: (city ?? "").trim() || undefined,
    sort: (sort ?? "").trim() || undefined,
  };

  return getRoListings(query, undefined);
}

/**
 * Get RO listings with server-side cache. Use for /ro page initial render (no internal fetch).
 * Unauthenticated only (access undefined). Load-more and API route remain uncached or use route Cache-Control.
 */
export async function getListingsCached(params: ListingsCacheParams): Promise<RoListingsResult> {
  const guarded = applyGuardrails(params);
  const key = buildCacheKey(guarded);
  const categorySlug = normalizeCategoryTag(guarded.category);
  const tags = categorySlug
    ? ["ro-listings", `ro-listings:category:${categorySlug}`]
    : ["ro-listings"];
  const result = await unstable_cache(
    () => fetchListingsUncached(guarded),
    ["ro-listings", key],
    { revalidate: CACHE_REVALIDATE_SECONDS, tags }
  )();
  return result;
}

function stableSortedJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    const val = obj[k];
    if (val === undefined) continue;
    sorted[k] = val;
  }
  return JSON.stringify(sorted);
}

/**
 * Full searchParams (same as /ro URL) → first page of listings. Matches GET /api/ro/listings filters.
 * Tags: `ro-listings`, optional `ro-listings:category:<slug>` for revalidatePath/tag flows.
 */
export async function getListingsCachedFromFullSearchParams(
  raw: Record<string, string | string[] | undefined>,
  access?: AccessContext,
): Promise<RoListingsResult> {
  const { query, cacheKey } = normalizeRoListingsRawSearchParams(raw);
  if (access?.hasExecutariAccess) {
    return getRoListings(query, access);
  }
  const categorySlug = normalizeCategoryTag(query.categorie);
  const tags = categorySlug
    ? ["ro-listings", `ro-listings:category:${categorySlug}`]
    : ["ro-listings"];
  return unstable_cache(
    () => getRoListings(query, access),
    ["ro-listings-full", cacheKey],
    { revalidate: CACHE_REVALIDATE_SECONDS, tags }
  )();
}

/** Strict total count for the same URL (aligned with /api/ro/listings-count). */
export async function getListingsCountCachedFromFullSearchParams(
  raw: Record<string, string | string[] | undefined>,
  access?: AccessContext,
): Promise<number> {
  const { query: base } = normalizeRoListingsRawSearchParams(raw);
  const key = stableSortedJson({
    ...(base as unknown as Record<string, unknown>),
    hasExecutariAccess: access?.hasExecutariAccess === true,
  });
  if (access?.hasExecutariAccess) {
    return countProducts(base, access);
  }
  const categorySlug = normalizeCategoryTag(base.categorie);
  const tags = categorySlug
    ? ["ro-listings", `ro-listings:category:${categorySlug}`]
    : ["ro-listings"];
  return unstable_cache(
    () => countProducts(base, access),
    ["ro-listings-count-full", key],
    { revalidate: CACHE_REVALIDATE_SECONDS, tags }
  )();
}
