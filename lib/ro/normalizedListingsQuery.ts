import { buildQueryFromParams } from "../listings/filters/queryFromParams";
import { normalizeListingsSearchQText } from "../listings/filters/qSearchAutocorrect";
import { stripDiacritics } from "../search/normalize";
import type { ProductQuery } from "../server/products/listingsRepo";
import { RO_LISTINGS_MAX_PAGE, RO_LISTINGS_PAGE_SIZE_DESKTOP } from "./roListingsPagination";

export const RO_LISTINGS_MAX_LIMIT = 100;
export const RO_LISTINGS_MAX_Q_LENGTH = 100;

/** Keys accepted by /ro listing/count flows. Keep SSR, API, and client forwarding on this list. */
export const RO_LISTINGS_SUPPORTED_PARAM_KEYS = new Set([
  "q",
  "titleSearch",
  "titleSearchMode",
  "category",
  "categorie",
  "subcategory",
  "subcategorie",
  "categories",
  "subcategories",
  "level3",
  "level3s",
  "category_level_3",
  "execCat",
  "execCats",
  "execMain",
  "county",
  "city",
  "location",
  "locations",
  "radiusKm",
  "nearLat",
  "nearLng",
  "priceMin",
  "price_max",
  "priceMax",
  "price_min",
  "size",
  "sizes",
  "brand",
  "brands",
  "model",
  "color",
  "colors",
  "condition",
  "conditions",
  "product_type",
  "productType",
  "sale_type",
  "saleType",
  "fuel",
  "bodyType",
  "partType",
  "department",
  "apparelType",
  "footwearType",
  "accessoryType",
  "status",
  "sort",
  "page",
  "from",
  "limit",
  "cursor",
  "scope",
  "includeExecutari",
  "images",
  "vanzator",
  "freeOnly",
  "free",
]);

export type RawRoSearchParams = Record<string, string | string[] | undefined>;

export interface NormalizedRoListingsQuery {
  query: ProductQuery;
  hasFilters: boolean;
  searchParams: URLSearchParams;
  cacheKey: string;
}

function normalizeText(value: string | undefined | null): string {
  if (value == null) return "";
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return stripDiacritics(trimmed).trim() || trimmed;
}

function normalizeQ(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const out = normalizeListingsSearchQText(s, RO_LISTINGS_MAX_Q_LENGTH);
  return out || undefined;
}

function stableSortedJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    sorted[key] = Array.isArray(value) ? [...value].sort() : value;
  }
  return JSON.stringify(sorted);
}

export function rawRoSearchParamsToURLSearchParams(raw: RawRoSearchParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first == null || String(first).trim() === "") continue;
    sp.set(key, String(first));
  }
  return sp;
}

export function sanitizeRoListingsSearchParams(source: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of source.entries()) {
    if (!RO_LISTINGS_SUPPORTED_PARAM_KEYS.has(key)) continue;
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    params.set(key, trimmed);
  }

  const q = params.get("q")?.trim();
  if (q) {
    const qNorm = normalizeText(q);
    const categoryNorm = normalizeText((params.get("category") ?? params.get("categorie") ?? "").replace(/-/g, " "));
    const subcategoryNorm = normalizeText((params.get("subcategory") ?? params.get("subcategorie") ?? "").replace(/-/g, " "));
    if (qNorm && (qNorm === categoryNorm || qNorm === subcategoryNorm)) {
      params.delete("q");
    } else {
      params.set("q", q.slice(0, RO_LISTINGS_MAX_Q_LENGTH));
    }
  }

  return params;
}

export function normalizeRoListingsSearchParams(source: URLSearchParams): NormalizedRoListingsQuery {
  const searchParams = sanitizeRoListingsSearchParams(source);
  const { query: rawQuery, hasFilters } = buildQueryFromParams(searchParams);
  const rawLimit = Number(rawQuery.limit ?? RO_LISTINGS_PAGE_SIZE_DESKTOP);
  const limit = Math.min(RO_LISTINGS_MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : RO_LISTINGS_PAGE_SIZE_DESKTOP));
  const rawPage = Number(rawQuery.page ?? 1);
  const page = Math.min(RO_LISTINGS_MAX_PAGE, Math.max(1, Number.isFinite(rawPage) ? rawPage : 1));
  const listingsCursor = rawQuery.listingsCursor ?? undefined;
  const from = listingsCursor ? 0 : Math.max(0, Number(rawQuery.from ?? (page - 1) * limit) || 0);
  const hasGeoCenter =
    rawQuery.near_lat != null &&
    rawQuery.near_lng != null &&
    Number.isFinite(rawQuery.near_lat) &&
    Number.isFinite(rawQuery.near_lng);
  const q = normalizeQ(rawQuery.q);

  const query: ProductQuery = {
    ...rawQuery,
    from,
    limit,
    page,
    pageSize: limit,
    listingsCursor,
    q,
    radius_km: hasGeoCenter ? rawQuery.radius_km : undefined,
  };

  const cacheKey = stableSortedJson(query as unknown as Record<string, unknown>);
  return { query, hasFilters, searchParams, cacheKey };
}

export function normalizeRoListingsRawSearchParams(raw: RawRoSearchParams): NormalizedRoListingsQuery {
  return normalizeRoListingsSearchParams(rawRoSearchParamsToURLSearchParams(raw));
}

/** `limit` explicit din URL; `null` dacă lipsește sau e invalid (se folosește 18/24 după viewport). */
export function parseExplicitRoListingsPageLimit(source: URLSearchParams): number | null {
  const raw = source.get("limit")?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(RO_LISTINGS_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

/** Paginare aliniată cu SSR/API (suportă `from` fără `page` în URL). */
export function getRoListingsPaginationFromSearchParams(source: URLSearchParams): {
  page: number;
  from: number;
  limit: number;
} {
  const { query } = normalizeRoListingsSearchParams(source);
  const page =
    typeof query.page === "number" && Number.isFinite(query.page) && query.page >= 1 ? query.page : 1;
  const from =
    typeof query.from === "number" && Number.isFinite(query.from) && query.from >= 0 ? query.from : 0;
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit) && query.limit >= 1
      ? query.limit
      : RO_LISTINGS_PAGE_SIZE_DESKTOP;
  return { page, from, limit };
}
