/**
 * DB access layer for RO listings - /api/ro/listings.
 * Exposes getRoListings() with a stable signature for future Prisma migration.
 * Default: Supabase. Set USE_PRISMA_LISTINGS=true in .env.local to use Prisma (dev only).
 * Server-side callers: use getListingsCached() from @/lib/ro/getListingsCached for cached data.
 */

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { prisma } from "@/lib/server/db";
import type { Prisma } from "@/lib/generated/prisma";
import { stripDiacritics } from "@/lib/search/normalize";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { getRoExecutariCrosslistEnabled } from "@/lib/ro-crosslist-settings";
import type { AccessContext } from "@/lib/server/access/resolveAccess";
import { normalizeConditionForForm } from "@/lib/attributes";
import {
  getPieseAutoCategoryLevel3MatchVariants,
  pieseAutoCategoryLevel3RowMatchesFilter,
  pieseAutoCategoryLevel3RowMatchesAnySlug,
} from "@/lib/piese-auto/tip-piesa-level3";
import { buildPrismaWhereStrict, type RoChannel, USE_PRODUCTS_CHANNEL } from "@/lib/server/products/listingsWhere";
import { resolveSellerUserIdsForQuery } from "@/lib/seller/resolveSellerUserIdsForQuery";
import { enrichItemsWithImageFocal } from "@/lib/server/products/imageFocalEnrichment";
import { decodeListingsCursor, encodeListingsCursor, isListingsKeysetSortOrder } from "@/lib/server/products/listingsCursor";
import { isRetryablePostgrestError, runPostgrestQuery } from "@/lib/server/supabase/postgrest";
import { haversineDistanceKm, parseCoordinatesJson } from "@/lib/geo/haversine";
import { getProductsDerivedDataVersion } from "@/lib/server/products/derivedDataVersion";
import { getOrLoadFromSharedTtlCache } from "@/lib/server/sharedTtlCache";
import { isPlausibleProductImageSource } from "@/lib/image/isPlausibleProductImageSource";

/** Grid/list payload only — no description/documents/seo/risk JSON blobs (detail pages fetch those). */
const LISTING_SELECT = [
  "id",
  "user_id",
  "title",
  "slug",
  "url",
  "images",
  "category",
  "subcategory",
  "category_level_3",
  "size",
  "brand",
  "model",
  "color",
  "condition",
  "starting_price",
  "starting_price_ron",
  "starting_price_eur",
  "product_type",
  "sale_type",
  "status",
  "county",
  "city",
  "product_location",
  "auction_date",
  "custom_fields",
  "attributes",
  "created_at",
  "is_premium",
  "premium_until",
  "sold_at",
  "coordinates",
].join(",");

const LISTING_SELECT_OBJ = {
  id: true,
  user_id: true,
  title: true,
  slug: true,
  url: true,
  images: true,
  category: true,
  subcategory: true,
  category_level_3: true,
  size: true,
  brand: true,
  model: true,
  color: true,
  condition: true,
  starting_price: true,
  starting_price_ron: true,
  starting_price_eur: true,
  product_type: true,
  sale_type: true,
  status: true,
  county: true,
  city: true,
  product_location: true,
  auction_date: true,
  custom_fields: true,
  attributes: true,
  created_at: true,
  is_premium: true,
  premium_until: true,
  sold_at: true,
  coordinates: true,
} as const;

/** Scope for /ro: all = both channels; live_bid = only anunțuri fără tokeni (channel ro); executari = only Executări (channel executari_insolventa). */
export type ListingsScope = "all" | "live_bid" | "executari";

export interface ProductQuery {
  /** Channel: ro (default) or executari_insolventa. Not a taxonomy category. */
  channel?: RoChannel;
  /** When set, overrides channel filter: live_bid = only ro, executari = only executari_insolventa. */
  scope?: ListingsScope;
  /** Opt-in cross-listing: show Executări rows inside other categories when they map to them. */
  includeExecutariCrosslist?: boolean;
  from?: number;
  limit?: number;
  q?: string;
  categorie?: string;
  categories?: string[];
  subcategorie?: string;
  subcategory?: string;
  subcategories?: string[];
  category_level_3?: string;
  /** Mai multe valori level3 (ex. URL level3s) – tip piesă multiplu la piese-auto. */
  category_level_3s?: string[];
  /** Executări: filtru după custom_fields.listing_category (ex: Terenuri). */
  list_category?: string;
  list_categories?: string[];
  county?: string;
  city?: string;
  location?: string;
  price_min?: number;
  price_max?: number;
  size?: string;
  sizes?: string[];
  brand?: string;
  brands?: string[];
  color?: string;
  colors?: string[];
  condition?: string;
  conditions?: string[];
  /** Filtru poze: with = are imagini, without = fără imagini. */
  images?: "with" | "without";
  model?: string;
  product_type?: string;
  sale_type?: string;
  status?: string | string[];
  sort?: string;
  fuel?: string;
  bodyType?: string;
  partType?: string;
  department?: string;
  apparelType?: string;
  footwearType?: string;
  accessoryType?: string;
  /** Din URL `vanzator`; rezolvat în `seller_user_ids` pe server. */
  sellerKinds?: ("particular" | "companie")[];
  seller_user_ids?: string[];
  /** True = particular: excludem `seller_user_ids` (companie), păstrăm null. */
  seller_user_ids_exclude?: boolean;
  /** Doar anunțuri marcate gratuit în custom_fields (is_free_listing / isFreeListing). */
  freeOnly?: boolean;
  page?: number;
  pageSize?: number;
  locale?: string;
  /** Opaque keyset cursor (created_at DESC, id DESC). When set, `from`/`page` offsets are ignored (Prisma path). */
  listingsCursor?: string | null;
  /** Rază în km față de (near_lat, near_lng); rândurile cu coordinates în afara razei sunt excluse. */
  radius_km?: number;
  near_lat?: number;
  near_lng?: number;
}

export interface RoListingsResult {
  items: Record<string, unknown>[];
  nextFrom: number;
  /** Present when Prisma keyset pagination applies (default sort). Prefer over nextFrom for load-more. */
  nextCursor?: string | null;
  hasMore: boolean;
  totalMatched?: number;
  meta?: { relaxed?: boolean; relaxationSteps?: string[] };
}

const USE_PRISMA = process.env.USE_PRISMA_LISTINGS === "true";

function isPrismaTransientListingsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const msg = typeof e.message === "string" ? e.message : "";
  const name = typeof e.name === "string" ? e.name : "";
  const cause = e.cause as Record<string, unknown> | undefined;
  const causeKind = typeof cause?.kind === "string" ? cause.kind : "";
  const causeMsg = typeof cause?.message === "string" ? cause.message : "";
  const combined = `${name} ${msg} ${causeKind} ${causeMsg}`.toLowerCase();
  return (
    combined.includes("echeckouttimeout") ||
    combined.includes("unable to check out connection from the pool") ||
    combined.includes("driveradaptererror") ||
    combined.includes("canceling statement due to statement timeout") ||
    combined.includes("statement timeout") ||
    combined.includes("sockettimeout") ||
    combined.includes(":closed") ||
    combined.includes("connectionclosed") ||
    combined.includes("too many database connections")
  );
}

/**
 * Detects transient Supabase/PostgREST errors that should be retried rather than
 * thrown all the way up to RoPage (where they crash the route). Covers:
 *  - PGRST002 ("Could not query the database for the schema cache. Retrying.")
 *  - Upstream timeouts (edge / PostgREST)
 *  - Driver-level ":closed" / connection reset errors
 */
function isRetryableSupabaseListingsError(error: unknown): boolean {
  if (isRetryablePostgrestError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const details = typeof e.details === "string" ? e.details.toLowerCase() : "";
  const hint = typeof e.hint === "string" ? e.hint.toLowerCase() : "";
  const haystack = `${msg} ${details} ${hint}`;
  return haystack.includes("terminating connection due to administrator command");
}

const SUPABASE_LISTINGS_MAX_RETRIES = 2;
const SUPABASE_LISTINGS_RETRY_DELAY_MS = 250;
const listingsDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const DEFAULT_STATUS = ["active", "reserved", "sold", "in_progress"] as const;
const SUPABASE_MAX_SCAN_ROWS = 100000;
const SUPABASE_SCAN_BATCH = 500;
const ENTERPRISE_LISTINGS_CACHE_NAMESPACE = "cache:ro-listings-enterprise";
const ENTERPRISE_LISTINGS_CACHE_TTL_MS = 30_000;
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

function cleanLocationValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanFastLocationPattern(value: unknown): string {
  return cleanLocationValue(value)
    .split(",")[0]
    .replace(/[%_()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMissingLocationValue(value: unknown): boolean {
  const raw = cleanLocationValue(value);
  if (!raw) return true;
  const norm = normalizeForSearch(raw);
  return (
    norm === "locatie neprecizata" ||
    norm === "locație neprecizata" ||
    norm === "locație neprecizată" ||
    norm === "romania"
  );
}

function composeProfileLocation(profile: Record<string, unknown>): {
  city: string;
  county: string;
  label: string;
} | null {
  const city =
    cleanLocationValue(profile.city) ||
    cleanLocationValue(profile.company_city) ||
    cleanLocationValue(profile.location);
  const county =
    cleanLocationValue(profile.company_county) ||
    "";
  const address =
    cleanLocationValue(profile.address) ||
    cleanLocationValue(profile.company_address);
  const parts = [city, county].filter(Boolean);
  const label = parts.length > 0 ? parts.join(", ") : address;
  if (!label) return null;
  return { city, county, label };
}

function ensureListingLocationLabels(items: Record<string, unknown>[]): void {
  for (const item of items) {
    const cf = item.custom_fields && typeof item.custom_fields === "object"
      ? { ...(item.custom_fields as Record<string, unknown>) }
      : {};
    const city =
      cleanLocationValue(item.city) ||
      cleanLocationValue(cf.city) ||
      cleanLocationValue(cf.oras);
    const county =
      cleanLocationValue(item.county) ||
      cleanLocationValue(cf.county) ||
      cleanLocationValue(cf.judet);
    const label = [city, county].filter(Boolean).join(", ");
    if (label && isMissingLocationValue(item.product_location)) {
      item.product_location = label;
    }
    if (label && isMissingLocationValue(cf.locatie)) {
      cf.locatie = label;
      if (city && isMissingLocationValue(cf.city)) cf.city = city;
      if (county && isMissingLocationValue(cf.county)) cf.county = county;
      item.custom_fields = cf;
    }
  }
}

const FALLBACK_LOCALITY_COORDS: Record<string, { city: string; county: string; lat: number; lng: number }> = {
  bucuresti: { city: "București", county: "București", lat: 44.4268, lng: 26.1025 },
  craiova: { city: "Craiova", county: "Dolj", lat: 44.3302, lng: 23.7949 },
  segarcea: { city: "Segarcea", county: "Dolj", lat: 44.0947, lng: 23.7469 },
  "cluj-napoca": { city: "Cluj-Napoca", county: "Cluj", lat: 46.7712, lng: 23.6236 },
  timisoara: { city: "Timișoara", county: "Timiș", lat: 45.7489, lng: 21.2087 },
  iasi: { city: "Iași", county: "Iași", lat: 47.1585, lng: 27.6014 },
  brasov: { city: "Brașov", county: "Brașov", lat: 45.6427, lng: 25.5887 },
  constanta: { city: "Constanța", county: "Constanța", lat: 44.1598, lng: 28.6348 },
  galati: { city: "Galați", county: "Galați", lat: 45.4353, lng: 28.008 },
  ploiesti: { city: "Ploiești", county: "Prahova", lat: 44.9367, lng: 26.0129 },
  pitesti: { city: "Pitești", county: "Argeș", lat: 44.8565, lng: 24.8692 },
};

function setListingCoordinates(item: Record<string, unknown>, coordinates: { lat: number; lng: number }): void {
  item.coordinates = coordinates;
  const cf = item.custom_fields && typeof item.custom_fields === "object"
    ? { ...(item.custom_fields as Record<string, unknown>) }
    : {};
  cf.coordinates = coordinates;
  item.custom_fields = cf;
}

function getListingCityCounty(item: Record<string, unknown>): { city: string; county: string } {
  const cf = item.custom_fields && typeof item.custom_fields === "object"
    ? (item.custom_fields as Record<string, unknown>)
    : {};
  const city =
    cleanLocationValue(item.city) ||
    cleanLocationValue(cf.city) ||
    cleanLocationValue(cf.oras);
  const county =
    cleanLocationValue(item.county) ||
    cleanLocationValue(cf.county) ||
    cleanLocationValue(cf.judet);
  return { city, county };
}

async function applyLocalityCoordinateFallback(items: Record<string, unknown>[]): Promise<void> {
  const missing = items.filter((item) => !getListingCoordinates(item));
  if (missing.length === 0) return;

  const cityNorms = Array.from(
    new Set(
      missing
        .map((item) => normalizeForSearch(getListingCityCounty(item).city))
        .filter((city) => city.length >= 2)
    )
  );

  const localityRows: Array<{ city_name?: unknown; county_name?: unknown; latitude?: unknown; longitude?: unknown }> = [];
  if (supabaseAdmin && cityNorms.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("ro_localities")
      .select("city_name, city_norm, county_name, latitude, longitude")
      .in("city_norm", cityNorms)
      .limit(5000);
    if (!error && Array.isArray(data)) {
      localityRows.push(...(data as typeof localityRows));
    }
  }

  const byCity = new Map<string, typeof localityRows>();
  for (const row of localityRows) {
    const key = normalizeForSearch(String(row.city_name ?? ""));
    if (!key) continue;
    const arr = byCity.get(key) ?? [];
    arr.push(row);
    byCity.set(key, arr);
  }

  for (const item of missing) {
    const { city, county } = getListingCityCounty(item);
    const cityNorm = normalizeForSearch(city);
    if (!cityNorm) continue;
    const countyNorm = normalizeForSearch(county);
    const rows = byCity.get(cityNorm) ?? [];
    const row =
      rows.find((candidate) => !countyNorm || normalizeForSearch(String(candidate.county_name ?? "")).includes(countyNorm)) ??
      rows[0];
    const lat = Number(row?.latitude);
    const lng = Number(row?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setListingCoordinates(item, { lat, lng });
      continue;
    }
    const fallback = FALLBACK_LOCALITY_COORDS[cityNorm] ?? FALLBACK_LOCALITY_COORDS[cityNorm.replace(/\s+/g, "-")];
    if (fallback) {
      if (isMissingLocationValue(item.city)) item.city = fallback.city;
      if (isMissingLocationValue(item.county)) item.county = fallback.county;
      setListingCoordinates(item, { lat: fallback.lat, lng: fallback.lng });
    }
  }
}

async function applyUserProfileLocationFallback(items: Record<string, unknown>[]): Promise<void> {
  if (items.length === 0) return;
  ensureListingLocationLabels(items);
  if (!supabaseAdmin) {
    await applyLocalityCoordinateFallback(items);
    return;
  }
  const userIds = Array.from(
    new Set(
      items
        .filter((item) =>
          isMissingLocationValue(item.city) &&
          isMissingLocationValue(item.county) &&
          isMissingLocationValue(item.product_location)
        )
        .map((item) => cleanLocationValue(item.user_id))
        .filter(Boolean)
    )
  );
  if (userIds.length === 0) {
    await applyLocalityCoordinateFallback(items);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, city, location, company_city, company_county, address, company_address")
    .in("user_id", userIds);
  if (error || !data) {
    if (error) console.warn("[listingsRepo] user profile location fallback failed:", error.message);
    await applyLocalityCoordinateFallback(items);
    return;
  }

  const profileByUserId = new Map<string, { city: string; county: string; label: string }>();
  for (const profile of data as Record<string, unknown>[]) {
    const userId = cleanLocationValue(profile.user_id);
    const location = composeProfileLocation(profile);
    if (userId && location) profileByUserId.set(userId, location);
  }

  for (const item of items) {
    const userId = cleanLocationValue(item.user_id);
    const fallback = profileByUserId.get(userId);
    if (!fallback) continue;
    if (isMissingLocationValue(item.city) && fallback.city) item.city = fallback.city;
    if (isMissingLocationValue(item.county) && fallback.county) item.county = fallback.county;
    if (isMissingLocationValue(item.product_location)) item.product_location = fallback.label;
    const cf = item.custom_fields && typeof item.custom_fields === "object"
      ? { ...(item.custom_fields as Record<string, unknown>) }
      : {};
    if (isMissingLocationValue(cf.locatie)) cf.locatie = fallback.label;
    if (isMissingLocationValue(cf.city) && fallback.city) cf.city = fallback.city;
    if (isMissingLocationValue(cf.county) && fallback.county) cf.county = fallback.county;
    item.custom_fields = cf;
  }
  ensureListingLocationLabels(items);
  await applyLocalityCoordinateFallback(items);
}

/** Strip diacritics for search fallback (q without diacritics) */
function normalizeForSearch(s: string): string {
  if (!s || typeof s !== "string") return "";
  return stripDiacritics(s).toLowerCase().trim();
}

function normalizeSubcategoryToKey(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/[ăâîșț]/g, (c) => ({ "ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t" }[c] || c))
    .replace(/\s+/g, "-");
}

function isExecutariLikeRow(row: Record<string, unknown>): boolean {
  const categoryNorm = normalizeForSearch(String(row.category ?? ""));
  const productTypeNorm = normalizeForSearch(String(row.product_type ?? ""));
  const saleTypeNorm = normalizeForSearch(String(row.sale_type ?? ""));

  return (
    categoryNorm === "executari" ||
    categoryNorm.includes("executari") ||
    productTypeNorm === "licitatii-publice" ||
    saleTypeNorm === "licitatii-insolventa" ||
    saleTypeNorm === "licitatie-publica"
  );
}

function deriveExecutariLinkedCategory(row: Record<string, unknown>): string {
  const subKey = normalizeSubcategoryToKey(String(row.subcategory ?? ""));
  const categoryText = normalizeForSearch(String(row.category ?? ""));
  const listingMain = normalizeForSearch(String((row.custom_fields as Record<string, unknown> | null)?.listing_main_category ?? ""));
  const listingCat = normalizeForSearch(String((row.custom_fields as Record<string, unknown> | null)?.listing_category ?? ""));
  const full = `${subKey} ${categoryText} ${listingMain} ${listingCat}`;

  if (listingMain) {
    if (listingMain.includes("imobil")) return "imobiliare";
    if (listingMain.includes("autovehicul") || listingMain.includes("auto")) return "autovehicule";
    if (listingMain.includes("utilaje") || listingMain.includes("echipament")) return "utilaje";
    if (listingMain.includes("electronice") || listingMain.includes("tehnolog")) return "electronice";
    if (listingMain.includes("diverse") || listingMain.includes("speciale")) return "diverse";
    if (listingMain.includes("business") || listingMain.includes("afaceri") || listingMain.includes("office")) return "business";
    if (listingMain.includes("materiale")) return "materiale";
  }

  if (subKey === "exec-imobiliare" || /\b(imobil|apartament|casa|teren|spatiu)\b/.test(full)) return "imobiliare";
  if (subKey === "exec-autovehicule" || /\b(auto|autoturism|vehicul|camion|motocic)\b/.test(full)) return "autovehicule";
  if (subKey === "exec-industrial" || /\b(utilaj|industrial|echipament|tractor|excavator)\b/.test(full)) return "utilaje";
  if (subKey === "exec-afaceri" || subKey === "exec-office" || /\b(afaceri|office|stoc|firma|lichidare)\b/.test(full)) return "business";
  return "diverse";
}

function getSyntheticSubcategory(linkedCategory: string): string {
  if (linkedCategory === "imobiliare") return "apartamente";
  if (linkedCategory === "autovehicule") return "autoturisme";
  if (linkedCategory === "utilaje") return "utilaje-constructii";
  if (linkedCategory === "business") return "lichidari-firme";
  return "colectii-private";
}

function getCategoryDisplayNorm(categorySlug: string): string {
  return normalizeForSearch(RO_CATEGORIES[categorySlug]?.name ?? "");
}

function getQueryCategories(query: ProductQuery): string[] {
  const categories = (query.categories ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const single = (query.categorie ?? "").trim().toLowerCase();
  if (categories.length > 0) return Array.from(new Set(categories));
  return single && single !== "all" ? [single] : [];
}

function getQuerySubcategories(query: ProductQuery): string[] {
  const subcategories = (query.subcategories ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const single = (query.subcategorie ?? query.subcategory ?? "").trim().toLowerCase();
  if (subcategories.length > 0) return Array.from(new Set(subcategories));
  return single && single !== "all" ? [single] : [];
}

function rowMatchesCategory(row: Record<string, unknown>, category: string, includeExecutariCrosslist: boolean): boolean {
  const rowCategoryNorm = normalizeForSearch(String(row.category ?? ""));
  const categorySlugNorm = normalizeForSearch(category);
  const categoryDisplayNorm = getCategoryDisplayNorm(category);

  if (
    rowCategoryNorm === categorySlugNorm ||
    (categoryDisplayNorm ? rowCategoryNorm === categoryDisplayNorm : false)
  ) {
    return true;
  }

  if (category === "executari" && isExecutariLikeRow(row)) {
    return true;
  }

  if (!includeExecutariCrosslist && isExecutariLikeRow(row)) {
    return false;
  }

  const extraSubs = CATEGORY_EXTRA_SUBCATEGORIES[categorySlugNorm] || [];
  const rowSubKey = normalizeSubcategoryToKey(String(row.subcategory ?? ""));
  return extraSubs.includes(rowSubKey);
}

function expandSubcategoryFilter(subcategory: string): string[] {
  if (subcategory === "terenuri") {
    return Array.from(new Set([...TERENURI_SUBCATEGORIES, ...(SUBCATEGORY_EXTRA_SUBCATEGORIES[subcategory] ?? [])]));
  }
  return Array.from(new Set([subcategory, ...(SUBCATEGORY_EXTRA_SUBCATEGORIES[subcategory] ?? [])]));
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const parsed = Number(v.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isRealListingImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  // Treat generic and category-default placeholders as "no real image".
  if (lower.includes("no-image-placeholder")) return false;
  if (lower.includes("/images/category-defaults/")) return false;
  if (lower.includes("placeholder")) return false;
  return isPlausibleProductImageSource(trimmed);
}

function listingHasImages(images: unknown): boolean {
  if (!Array.isArray(images)) return false;
  return images.some((img) => {
    if (typeof img === "string") return isRealListingImageUrl(img);
    if (img && typeof img === "object") {
      const url = (img as { url?: unknown }).url;
      return typeof url === "string" && isRealListingImageUrl(url);
    }
    return false;
  });
}

function rowMatchesImagesFilter(
  row: Record<string, unknown>,
  imagesFilter: ProductQuery["images"] | undefined
): boolean {
  if (imagesFilter === "with") return listingHasImages(row.images);
  if (imagesFilter === "without") return !listingHasImages(row.images);
  return true;
}

function getListingCoordinates(row: Record<string, unknown>): { lat: number; lng: number } | null {
  return parseCoordinatesJson(row.coordinates) || parseCoordinatesJson((row.custom_fields as Record<string, unknown> | null)?.coordinates);
}

function rowMatchesSupabaseQuery(
  row: Record<string, unknown>,
  query: ProductQuery,
  includeExecutariCrosslist: boolean
): boolean {
  const q = (query.q ?? "").trim();
  if (q) {
    const words = q.split(/\s+/).filter(Boolean).map(normalizeForSearch);
    const hasBrandFilter =
      (query.brand && String(query.brand).trim() && String(query.brand).toLowerCase() !== "all") ||
      ((query.brands?.length ?? 0) > 0);
    const categoryScopeActive = getQueryCategories(query).length > 0;
    const cf = (row.custom_fields as Record<string, unknown> | null) ?? null;
    /** Cu categorie selectată: q se potrivește doar în câmpuri de listare, nu în slug-ul categoriei (evită „imobiliare” în altă categorie). */
    const haystack = normalizeForSearch(
      hasBrandFilter
        ? String(row.title ?? "")
        : categoryScopeActive
          ? [
              row.title,
              row.category_level_3,
              row.brand,
              (row as Record<string, unknown>).model,
              row.slug,
              row.city,
              row.county,
              row.product_location,
              cf?.listing_main_category,
              cf?.listing_category,
            ]
              .filter(Boolean)
              .join(" ")
          : [
              row.title,
              row.category,
              row.subcategory,
              row.category_level_3,
              row.brand,
              (row as Record<string, unknown>).model,
              row.slug,
              row.city,
              row.county,
              row.product_location,
              cf?.listing_main_category,
              cf?.listing_category,
            ]
              .filter(Boolean)
              .join(" ")
    );
    if (!words.every((w) => haystack.includes(w))) return false;
  }

  const categoryFilters = getQueryCategories(query);
  if (categoryFilters.length > 0) {
    if (!categoryFilters.some((category) => rowMatchesCategory(row, category, includeExecutariCrosslist))) return false;
  }

  const subcategoryFilters = getQuerySubcategories(query);
  if (subcategoryFilters.length > 0) {
    const rowSubKey = normalizeSubcategoryToKey(String(row.subcategory ?? ""));
    const rowL3Key = normalizeSubcategoryToKey(String(row.category_level_3 ?? ""));
    const allowedSubcategories = new Set(subcategoryFilters.flatMap(expandSubcategoryFilter));
    if (!allowedSubcategories.has(rowSubKey) && !allowedSubcategories.has(rowL3Key)) return false;
  }

  const l3List = (query.category_level_3s ?? [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const l3single = (query.category_level_3 ?? "").trim().toLowerCase();
  const rowSubForL3 = (query.subcategorie ?? query.subcategory ?? "").trim().toLowerCase();
  if (l3List.length > 0) {
    if (rowSubForL3 === "piese-auto") {
      if (!pieseAutoCategoryLevel3RowMatchesAnySlug(l3List, String(row.category_level_3 ?? ""))) return false;
    } else {
      const rowL3 = normalizeSubcategoryToKey(String(row.category_level_3 ?? ""));
      if (!l3List.some((l3) => rowL3 === normalizeSubcategoryToKey(l3))) return false;
    }
  } else if (l3single && l3single !== "all") {
    if (rowSubForL3 === "piese-auto") {
      if (!pieseAutoCategoryLevel3RowMatchesFilter(l3single, String(row.category_level_3 ?? ""))) return false;
    } else {
      const rowL3 = normalizeSubcategoryToKey(String(row.category_level_3 ?? ""));
      if (rowL3 !== normalizeSubcategoryToKey(l3single)) return false;
    }
  }

  const listCat = (query.list_category ?? "").trim();
  const listCats = query.list_categories?.filter((s) => s?.trim());
  if (listCats && listCats.length > 0) {
    const rowListCat = String((row.custom_fields as Record<string, unknown> | null)?.listing_category ?? "").trim();
    if (!listCats.some((c) => normalizeForSearch(c) === normalizeForSearch(rowListCat))) return false;
  } else if (listCat) {
    const rowListCat = String((row.custom_fields as Record<string, unknown> | null)?.listing_category ?? "").trim();
    if (normalizeForSearch(rowListCat) !== normalizeForSearch(listCat)) return false;
  }

  const county = (query.county ?? "").trim();
  if (county && !normalizeForSearch(String(row.county ?? "")).includes(normalizeForSearch(county))) return false;

  const city = (query.city ?? "").trim();
  if (city && !normalizeForSearch(String(row.city ?? "")).includes(normalizeForSearch(city))) return false;

  const location = (query.location ?? "").trim();
  if (location) {
    const loc = normalizeForSearch(location);
    const rowCounty = normalizeForSearch(String(row.county ?? ""));
    const rowCity = normalizeForSearch(String(row.city ?? ""));
    if (!rowCounty.includes(loc) && !rowCity.includes(loc)) return false;
  }

  const rKm = query.radius_km;
  const nLat = query.near_lat;
  const nLng = query.near_lng;
  if (rKm != null && rKm > 0 && nLat != null && nLng != null && Number.isFinite(nLat) && Number.isFinite(nLng)) {
    const pt = getListingCoordinates(row);
    if (!pt) return false;
    if (haversineDistanceKm({ lat: nLat, lng: nLng }, pt) > rKm) return false;
  }

  if (!rowMatchesImagesFilter(row, query.images)) return false;

  const cfFree = (row.custom_fields as Record<string, unknown> | null) ?? null;
  const rowIsFreeListing =
    cfFree?.is_free_listing === true || cfFree?.isFreeListing === true;
  if (query.freeOnly === true) {
    if (!rowIsFreeListing) return false;
  } else {
    if (query.price_min != null && toNumber(row.starting_price_ron) < query.price_min) return false;
    if (query.price_max != null && toNumber(row.starting_price_ron) > query.price_max) return false;
  }

  const rowSize = String(row.size ?? "");
  if ((query.sizes?.length ?? 0) > 0) {
    if (!query.sizes!.includes(rowSize)) return false;
  } else if (query.size && query.size !== "all") {
    if (normalizeForSearch(rowSize) !== normalizeForSearch(query.size)) return false;
  }

  const rowBrand = String(row.brand ?? "");
  const titleNormForBrand = normalizeForSearch(String(row.title ?? ""));
  if ((query.brands?.length ?? 0) > 0) {
    const ok = query.brands!.some((b) => {
      const want = normalizeForSearch(b);
      if (!want) return false;
      const rb = normalizeForSearch(rowBrand);
      return rb === want || rb.includes(want) || want.includes(rb) || titleNormForBrand.includes(want);
    });
    if (!ok) return false;
  } else if (query.brand && query.brand !== "all") {
    const want = normalizeForSearch(query.brand);
    if (want) {
      const rb = normalizeForSearch(rowBrand);
      if (rb !== want && !rb.includes(want) && !want.includes(rb) && !titleNormForBrand.includes(want)) return false;
    }
  }

  const rowColor = String(row.color ?? "");
  if ((query.colors?.length ?? 0) > 0) {
    const wanted = new Set(query.colors!.map((c) => normalizeForSearch(c)));
    if (!wanted.has(normalizeForSearch(rowColor))) return false;
  } else if (query.color && query.color !== "all") {
    if (normalizeForSearch(rowColor) !== normalizeForSearch(query.color)) return false;
  }

  const rowCondition = String(row.condition ?? "");
  const subForCond = (query.subcategorie ?? query.subcategory ?? "").trim().toLowerCase();
  if ((query.conditions?.length ?? 0) > 0) {
    if (subForCond === "piese-auto") {
      const wantedNorm = new Set(query.conditions!.map((c) => normalizeConditionForForm(c)));
      if (wantedNorm.size < 2) {
        const target = [...wantedNorm][0];
        if (normalizeConditionForForm(rowCondition) !== target) return false;
      }
    } else {
      const wanted = new Set(query.conditions!.map((c) => normalizeForSearch(c)));
      if (!wanted.has(normalizeForSearch(rowCondition))) return false;
    }
  } else if (query.condition && query.condition !== "all") {
    if (subForCond === "piese-auto") {
      if (normalizeConditionForForm(rowCondition) !== normalizeConditionForForm(query.condition)) return false;
    } else {
      if (normalizeForSearch(rowCondition) !== normalizeForSearch(query.condition)) return false;
    }
  }

  const modelFilter = (query.model ?? "").trim();
  if (modelFilter) {
    const modelNorm = normalizeForSearch(modelFilter);
    const columnModel = String((row as { model?: string }).model ?? "").trim();
    const cf = (row.custom_fields as Record<string, unknown> | null) ?? null;
    const cfModel = String(cf?.model ?? "").trim();
    const inColumn = columnModel && normalizeForSearch(columnModel).includes(modelNorm);
    const inCf = cfModel && normalizeForSearch(cfModel).includes(modelNorm);
    const inTitle = normalizeForSearch(String(row.title ?? "")).includes(modelNorm);
    if (!inColumn && !inCf && !inTitle) return false;
  }

  const productType = (query.product_type ?? "").trim();
  if (productType && normalizeForSearch(String(row.product_type ?? "")) !== normalizeForSearch(productType)) return false;
  const saleType = (query.sale_type ?? "").trim();
  if (saleType && normalizeForSearch(String(row.sale_type ?? "")) !== normalizeForSearch(saleType)) return false;

  const attrs = (row as { attributes?: Record<string, unknown> }).attributes ?? {};
  const attrKeys = ["fuel", "bodyType", "partType", "department", "apparelType", "footwearType", "accessoryType"] as const;
  for (const key of attrKeys) {
    const qVal = (query as Record<string, string | undefined>)[key]?.trim().toLowerCase();
    if (!qVal || qVal === "all") continue;
    const rowVal = String((attrs as Record<string, unknown>)[key] ?? "").toLowerCase();
    if (rowVal !== qVal) return false;
  }

  const su = query.seller_user_ids;
  const exclude = query.seller_user_ids_exclude === true;
  if (su != null) {
    const rawUid = (row as { user_id?: string | null }).user_id;
    const uid = rawUid == null ? "" : String(rawUid);
    if (exclude) {
      if (su.length === 0) return true;
      if (!uid) return true;
      if (su.includes(uid)) return false;
    } else {
      if (su.length === 0) return false;
      if (!uid || !su.includes(uid)) return false;
    }
  }

  return true;
}

/** Check if a listing row matches a ProductQuery. Exported for saved search alerts. */
export function listingMatchesQuery(
  row: Record<string, unknown>,
  query: ProductQuery,
  includeExecutariCrosslist = true
): boolean {
  return rowMatchesSupabaseQuery(row, query, includeExecutariCrosslist);
}

function sortSupabaseRows(items: Record<string, unknown>[], sort?: string, query?: ProductQuery): Record<string, unknown>[] {
  const out = [...items];
  const key = (sort ?? "").toLowerCase();
  const hasNearCenter =
    query?.near_lat != null &&
    query?.near_lng != null &&
    Number.isFinite(query.near_lat) &&
    Number.isFinite(query.near_lng);

  out.sort((a, b) => {
    if (hasNearCenter) {
      const aPoint = getListingCoordinates(a);
      const bPoint = getListingCoordinates(b);
      const aDistance = aPoint ? haversineDistanceKm({ lat: query!.near_lat!, lng: query!.near_lng! }, aPoint) : null;
      const bDistance = bPoint ? haversineDistanceKm({ lat: query!.near_lat!, lng: query!.near_lng! }, bPoint) : null;
      if (aDistance != null && bDistance != null && aDistance !== bDistance) return aDistance - bDistance;
      if ((aDistance != null) !== (bDistance != null)) return aDistance != null ? -1 : 1;
    }
    if (key === "price_asc" || key === "pricelow") return toNumber(a.starting_price_ron) - toNumber(b.starting_price_ron);
    if (key === "price_desc" || key === "pricehigh") return toNumber(b.starting_price_ron) - toNumber(a.starting_price_ron);
    if (key === "date_asc" || key === "oldest") return new Date(String(a.created_at ?? "")).getTime() - new Date(String(b.created_at ?? "")).getTime();
    if (key === "date_desc" || key === "newest" || key === "relevant" || key === "") {
      return new Date(String(b.created_at ?? "")).getTime() - new Date(String(a.created_at ?? "")).getTime();
    }
    if (key === "title") return String(a.title ?? "").localeCompare(String(b.title ?? ""));
    if (key === "timeleft") return new Date(String(a.auction_date ?? "")).getTime() - new Date(String(b.auction_date ?? "")).getTime();
    return new Date(String(b.created_at ?? "")).getTime() - new Date(String(a.created_at ?? "")).getTime();
  });

  return out;
}

/** Build Prisma where for strict step only; delegates to shared listingsWhere (channel + gating applied). */
function buildWhere(params: ProductQuery, access?: AccessContext): Prisma.productsWhereInput {
  return buildPrismaWhereStrict(params, access);
}

type OrderByResolved = {
  orderBy:
    | Prisma.productsOrderByWithRelationInput
    | Prisma.productsOrderByWithRelationInput[];
  /** When true, Prisma uses (created_at DESC, id DESC) and keyset pagination is allowed. */
  keysetEligible: boolean;
};

function buildOrderByResolved(sort?: string, q?: string): OrderByResolved {
  const s = (sort ?? "").toLowerCase();
  switch (s) {
    case "price_asc":
    case "pricelow":
      return { orderBy: { starting_price_ron: "asc" }, keysetEligible: false };
    case "price_desc":
    case "pricehigh":
      return { orderBy: { starting_price_ron: "desc" }, keysetEligible: false };
    case "date_asc":
    case "oldest":
      return { orderBy: { created_at: "asc" }, keysetEligible: false };
    case "date_desc":
    case "newest":
      return {
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        keysetEligible: true,
      };
    case "title":
      return { orderBy: { title: "asc" }, keysetEligible: false };
    case "timeleft":
      return { orderBy: { auction_date: "asc" }, keysetEligible: false };
    case "relevant":
    default:
      if (q && q.trim().length > 0) {
        const cleanWords = q
          .trim()
          .split(/\s+/)
          .map((w) => w.replace(/[&|<>!():*^]/g, ""))
          .filter(Boolean);
        if (cleanWords.length > 0) {
          return {
            orderBy: {
              _relevance: {
                fields: ["title", "brand", "model"],
                search: cleanWords.join(" | "),
                sort: "desc",
              },
            },
            keysetEligible: false,
          };
        }
      }
      return {
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        keysetEligible: true,
      };
  }
}

export type RunListingsQueryMeta = {
  items: Record<string, unknown>[];
  total: number;
  /** True when another row may exist after this page (strict query). */
  strictHasMore: boolean;
  /** Keyset mode (no OFFSET) for this request. */
  usedKeyset: boolean;
};

/**
 * Core Prisma query - used by main path and fallback steps.
 * Uses keyset pagination (created_at DESC, id DESC) when sort allows; otherwise OFFSET + LIMIT.
 */
async function runListingsQuery(
  params: ProductQuery,
  access: AccessContext | undefined,
  overrides?: { where?: Prisma.productsWhereInput; qOverride?: string }
): Promise<RunListingsQueryMeta> {
  const from = Math.max(0, params.from ?? 0);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? params.limit ?? 30;
  const limit = Math.min(Math.max(1, pageSize), 100);
  const skipLegacy = params.from != null ? from : (page - 1) * limit;
  const qEff = overrides?.qOverride ?? params.q;

  const baseWhere = overrides?.where ?? buildWhere(overrides?.qOverride != null ? { ...params, q: overrides.qOverride } : params, access);
  const { orderBy, keysetEligible } = buildOrderByResolved(params.sort, qEff);

  const cursorDecoded = params.listingsCursor ? decodeListingsCursor(params.listingsCursor) : null;
  const useOffsetFallback = keysetEligible && skipLegacy > 0 && !cursorDecoded;
  const useKeyset =
    keysetEligible &&
    !useOffsetFallback &&
    (cursorDecoded != null || (params.listingsCursor == null && skipLegacy === 0));

  let where: Prisma.productsWhereInput = baseWhere;
  let skip = 0;
  let take = limit + 1;

  if (useKeyset && cursorDecoded) {
    const d = new Date(cursorDecoded.ca);
    where = {
      AND: [
        baseWhere,
        {
          OR: [
            { created_at: { lt: d } },
            {
              AND: [{ created_at: { equals: d } }, { id: { lt: cursorDecoded.id } }],
            },
          ],
        },
      ],
    };
  } else if (useKeyset && !cursorDecoded && skipLegacy === 0) {
    where = baseWhere;
  } else if (useOffsetFallback) {
    where = baseWhere;
    skip = skipLegacy;
    take = limit + 1;
  } else {
    where = baseWhere;
    skip = skipLegacy;
    take = limit + 1;
  }

  const usedKeyset = useKeyset && !useOffsetFallback;

  const [rows, total] = await Promise.all([
    prisma.products.findMany({
      where,
      orderBy,
      skip: usedKeyset ? 0 : skip,
      take,
      select: LISTING_SELECT_OBJ,
    }),
    prisma.products.count({ where: baseWhere }),
  ]);

  const raw = rows as unknown as Record<string, unknown>[];
  const strictHasMore = raw.length > limit;
  const items = strictHasMore ? raw.slice(0, limit) : raw;
  await applyUserProfileLocationFallback(items as unknown as Record<string, unknown>[]);

  return {
    items,
    total,
    strictHasMore,
    usedKeyset,
  };
}

/** Max items to fetch per relaxed query when filling (to get enough after dedupe). */
const FILL_FETCH_BUFFER = 200;

/**
 * Progressive completion: fill results up to limit with relaxed queries.
 * Strict results first, then append relaxed (A → B → C → D) until collected.length >= limit.
 * Runs on every page (not only skip === 0) so search flows until real DB exhaustion.
 * Deduplication is page-scoped (within this request only).
 */
async function runWithFallback(params: ProductQuery, access?: AccessContext): Promise<RoListingsResult> {
  const from = Math.max(0, params.from ?? 0);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? params.limit ?? 30;
  const limit = Math.min(Math.max(1, pageSize), 100);
  const skip = params.from != null ? from : (page - 1) * limit;

  const result = await runListingsQuery(params, access);
  const relaxationSteps: string[] = [];
  const collected: Record<string, unknown>[] = [...result.items];
  const seenIds = new Set<string>(collected.map((i) => String((i as { id?: string }).id ?? "")));

  // If strict already fills the page, return as-is. Otherwise run progressive fill on this page.
  if (collected.length >= limit) {
    const pageItems = collected.slice(0, limit);
    const last = pageItems[pageItems.length - 1];
    const nextCursor =
      result.usedKeyset &&
      result.strictHasMore &&
      last &&
      isListingsKeysetSortOrder(params.sort, params.q)
        ? encodeListingsCursor(
            (last as { created_at?: Date | string }).created_at as Date,
            String((last as { id?: string }).id ?? "")
          )
        : null;
    return {
      items: pageItems,
      nextFrom: skip + pageItems.length,
      nextCursor,
      hasMore: result.strictHasMore,
      ...(relaxationSteps.length ? { meta: { relaxed: true, relaxationSteps } } : {}),
    };
  }

  let need = limit - collected.length;
  const q = (params.q ?? "").trim();
  const hasExplicitSubcategoryFilter = !!(params.subcategorie || params.subcategory);
  const hasFilters =
    !!params.categorie ||
    (params.categories?.length ?? 0) > 0 ||
    !!params.subcategorie ||
    (params.subcategories?.length ?? 0) > 0 ||
    !!params.county ||
    !!params.city ||
    !!params.location ||
    !!params.brand ||
    !!params.color ||
    !!params.condition ||
    !!params.size ||
    (params.sizes?.length ?? 0) > 0 ||
    (params.brands?.length ?? 0) > 0 ||
    (params.colors?.length ?? 0) > 0 ||
    (params.conditions?.length ?? 0) > 0 ||
    params.seller_user_ids != null;

  const appendUnseen = (items: Record<string, unknown>[], stepLabel: string): number => {
    let added = 0;
    for (const item of items) {
      if (need <= 0) break;
      const id = String((item as { id?: string }).id ?? "");
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      collected.push(item);
      added++;
      need--;
    }
    if (added > 0) relaxationSteps.push(stepLabel);
    return added;
  };

  const runRelaxedAndAppend = async (
    relaxedParams: ProductQuery,
    stepLabel: string,
    qOverride?: string
  ): Promise<boolean> => {
    if (need <= 0) return true;
    const fetchLimit = Math.min(need + FILL_FETCH_BUFFER, 100);
    const res = await runListingsQuery(
      { ...relaxedParams, from: 0, limit: fetchLimit, page: undefined, pageSize: fetchLimit },
      access,
      qOverride != null ? { qOverride } : undefined
    );
    const added = appendUnseen(res.items, stepLabel);
    return added > 0;
  };

  // Step A: remove soft filters one by one (accumulate)
  // It is ALWAYS better to relax soft filters (like color/condition/size/brand/city) before touching the text query.
  // Because if I search 'audi a6' in 'Cluj', it's better to show 'audi a6' in 'Bucuresti' than a 'Jaguar' in 'Cluj'.
  if (hasFilters && need > 0) {
    let relaxed = { ...params, from: 0, page: undefined, pageSize: limit };

    // Drop minor filters first
    relaxed.color = undefined;
    relaxed.colors = undefined;
    await runRelaxedAndAppend(relaxed, "A:color");

    if (need > 0) {
      relaxed = { ...relaxed, condition: undefined, conditions: undefined };
      await runRelaxedAndAppend(relaxed, "A:condition");
    }
    if (need > 0) {
      relaxed = { ...relaxed, size: undefined, sizes: undefined };
      await runRelaxedAndAppend(relaxed, "A:size");
    }
    if (need > 0) {
      relaxed = { ...relaxed, brand: undefined, brands: undefined };
      await runRelaxedAndAppend(relaxed, "A:brand");
    }

    // Step B: remove city and (optionally) subcategory.
    // When user explicitly selected a subcategory (ex: apartamente), keep it strict.
    if (need > 0) {
      if (hasExplicitSubcategoryFilter) {
        relaxed = { ...relaxed, city: undefined, county: undefined, location: undefined };
        await runRelaxedAndAppend(relaxed, "B:location-only");
      } else {
      relaxed = { ...relaxed, city: undefined, subcategorie: undefined, subcategory: undefined, county: undefined, location: undefined };
      await runRelaxedAndAppend(relaxed, "B:location-subcategory");
      }
    }
  }

  // Step C: Smart Text Relaxation (No more dumb 'first-word')
  if (q && need > 0) {
    // 1. Drop diacritics first (still strict AND on words)
    const qNoDiacritics = normalizeForSearch(q);
    if (qNoDiacritics !== q.toLowerCase().trim()) {
      await runRelaxedAndAppend(params, "C:no-diacritics", qNoDiacritics);
    }

    if (need > 0) {
      // 2. Remove common noisy stop-words coming from autocomplete suggestions
      const stopWords = new Set(["autoturism", "auto", "marca", "vehicul", "de", "vanzare", "vand", "apartament", "casa", "teren", "imobil"]);
      const importantWords = qNoDiacritics.split(/\s+/).filter(w => !stopWords.has(w) && w.length > 1);

      if (importantWords.length > 0 && importantWords.length < qNoDiacritics.split(/\s+/).length) {
        // e.g. "autoturism marca audi a6" -> "audi a6"
        await runRelaxedAndAppend(params, "C:smart-keywords", importantWords.join(" "));
      }

      // 3. If there are still multiple important words, fallback to the MOST specific (usually the longest or last words)
      // e.g., if "audi a6", try just "audi".
      if (need > 0 && importantWords.length > 1) {
        // Find longest word among important ones, assuming it's the brand/core noun
        const longestWord = importantWords.reduce((a, b) => a.length >= b.length ? a : b);
        await runRelaxedAndAppend(params, "C:longest-keyword", longestWord);
      }
    }
  }

  // Step D: minimal (only q + status/scope - drop basically ALL category filters)
  // Skip this ultra-broad step when subcategory was explicitly requested.
  if (need > 0 && !hasExplicitSubcategoryFilter) {
    const relaxedD: ProductQuery = {
      from: 0,
      limit: Math.min(need + FILL_FETCH_BUFFER, 100),
      pageSize: Math.min(need + FILL_FETCH_BUFFER, 100),
      q: params.q, // original search term, but no category binds
      status: params.status,
      product_type: params.product_type, // This preserves live-bid vs licitatii-publice tab toggles!
      sale_type: params.sale_type,
      sort: params.sort,
      channel: params.channel,
      scope: params.scope,
      sellerKinds: params.sellerKinds,
      seller_user_ids: params.seller_user_ids,
      seller_user_ids_exclude: params.seller_user_ids_exclude,
    };
    await runRelaxedAndAppend(relaxedD, "D:minimal");
  }

  const pageItems = collected.slice(0, limit);
  const last = pageItems[pageItems.length - 1];
  const hasMore = collected.length === limit;
  const nextCursor =
    hasMore && last && isListingsKeysetSortOrder(params.sort, params.q)
      ? encodeListingsCursor(
          (last as { created_at?: Date | string }).created_at as Date,
          String((last as { id?: string }).id ?? "")
        )
      : null;

  return {
    items: pageItems,
    nextFrom: skip + pageItems.length,
    nextCursor,
    hasMore,
    ...(relaxationSteps.length ? { meta: { relaxed: true, relaxationSteps } } : {}),
  };
}

/** True when query has no filters – safe to cache with unstable_cache for server/edge. */
function isCacheableDefaultQuery(query: ProductQuery, access?: AccessContext): boolean {
  if (access != null) return false;
  const q = (query.q ?? "").trim();
  const hasFilters =
    q.length > 0 ||
    !!query.categorie ||
    (query.categories?.length ?? 0) > 0 ||
    !!query.subcategorie ||
    !!query.subcategory ||
    (query.subcategories?.length ?? 0) > 0 ||
    !!query.category_level_3 ||
    !!query.county ||
    !!query.city ||
    !!query.location ||
    (query.price_min != null && query.price_min > 0) ||
    (query.price_max != null) ||
    !!query.size ||
    (query.sizes?.length ?? 0) > 0 ||
    !!query.brand ||
    (query.brands?.length ?? 0) > 0 ||
    !!query.color ||
    (query.colors?.length ?? 0) > 0 ||
    !!query.condition ||
    (query.conditions?.length ?? 0) > 0 ||
    !!query.images ||
    !!query.model ||
    !!query.product_type ||
    !!query.sale_type ||
    (Array.isArray(query.status) && query.status.length > 0) ||
    (typeof query.status === "string" && (query.status as string).trim() !== "") ||
    query.seller_user_ids != null ||
    (query.sellerKinds?.length === 1);
  return !hasFilters;
}

function normalizeFastTaxonomyValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getFastCategories(query: ProductQuery): string[] {
  const categories = (query.categories ?? [])
    .map((s) => normalizeFastTaxonomyValue(s))
    .filter((s) => s && s !== "all");
  const single = normalizeFastTaxonomyValue(query.categorie);
  if (categories.length > 0) return Array.from(new Set(categories));
  return single && single !== "all" ? [single] : [];
}

function getFastSubcategories(query: ProductQuery): string[] {
  const subcategories = (query.subcategories ?? [])
    .map((s) => normalizeFastTaxonomyValue(s))
    .filter((s) => s && s !== "all");
  const single = normalizeFastTaxonomyValue(query.subcategorie ?? query.subcategory);
  if (subcategories.length > 0) return Array.from(new Set(subcategories));
  return single && single !== "all" ? [single] : [];
}

function isKnownFastCategory(category: string): boolean {
  return !category || category === "all" || category in RO_CATEGORIES;
}

function isKnownFastSubcategory(subcategory: string): boolean {
  if (!subcategory || subcategory === "all") return true;
  return Object.values(RO_CATEGORIES).some((entry) => entry.subcategories.includes(subcategory));
}

function getFastSupabaseCategoryOr(cat: string, includeExecutariCrosslist: boolean): string | null {
  if (!cat || cat === "all") return null;
  if (cat === "executari") {
    return `category.ilike.%executari%,product_type.eq.licitatii-publice,sale_type.in.(${EXECUTARI_SALE_TYPES.join(",")})`;
  }
  const extraSubs = includeExecutariCrosslist ? (CATEGORY_EXTRA_SUBCATEGORIES[cat] ?? []) : [];
  const parts = [`category.eq.${cat}`];
  if (extraSubs.length > 0) {
    parts.push(`subcategory.in.(${extraSubs.join(",")})`);
  }
  return parts.join(",");
}

function getFastSupabaseCategoriesOr(categories: string[], includeExecutariCrosslist: boolean): string | null {
  const parts: string[] = [];
  for (const cat of categories) {
    const categoryOr = getFastSupabaseCategoryOr(cat, includeExecutariCrosslist);
    if (categoryOr) parts.push(categoryOr);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

function getFastSupabaseSubcategoriesOr(subcategories: string[]): string | null {
  const subs = subcategories.flatMap(expandSubcategoryFilter);
  const uniqueSubs = Array.from(new Set(subs));
  if (uniqueSubs.length === 0) return null;
  return uniqueSubs.length === 1
    ? `subcategory.eq.${uniqueSubs[0]},category_level_3.eq.${uniqueSubs[0]}`
    : `subcategory.in.(${uniqueSubs.join(",")}),category_level_3.in.(${uniqueSubs.join(",")})`;
}

function applyFastSupabaseTaxonomyFilters<T extends { or: (query: string) => T }>(
  builder: T,
  categories: string[],
  subcategories: string[],
  includeExecutariCrosslist: boolean
): T {
  let q = builder;
  const categoryOr = getFastSupabaseCategoriesOr(categories, includeExecutariCrosslist);
  if (categoryOr) q = q.or(categoryOr);
  const subcategoryOr = getFastSupabaseSubcategoriesOr(subcategories);
  if (subcategoryOr) q = q.or(subcategoryOr);
  return q;
}

function getFastPrismaTaxonomyConditions(
  categories: string[],
  subcategories: string[],
  includeExecutariCrosslist: boolean
): Prisma.productsWhereInput[] {
  const conditions: Prisma.productsWhereInput[] = [];
  if (categories.length > 0) {
    const categoryOr: Prisma.productsWhereInput[] = [];
    for (const cat of categories) {
      if (cat === "executari") {
        categoryOr.push(
          { category: { contains: "executari", mode: "insensitive" } },
          { product_type: { equals: "licitatii-publice", mode: "insensitive" } },
          { sale_type: { in: [...EXECUTARI_SALE_TYPES] } }
        );
      } else {
        const extraSubs = includeExecutariCrosslist ? (CATEGORY_EXTRA_SUBCATEGORIES[cat] ?? []) : [];
        categoryOr.push(
          { category: { equals: cat, mode: "insensitive" } },
          ...extraSubs.map((s) => ({ subcategory: { equals: s, mode: "insensitive" as const } }))
        );
      }
    }
    conditions.push({ OR: categoryOr });
  }

  if (subcategories.length > 0) {
    const subs = subcategories.flatMap(expandSubcategoryFilter);
    conditions.push({
      OR: Array.from(new Set(subs)).flatMap((s) => [
        { subcategory: { equals: s, mode: "insensitive" as const } },
        { category_level_3: { equals: s, mode: "insensitive" as const } },
      ]),
    });
  }
  return conditions;
}

function canUseFastSupabasePath(query: ProductQuery): boolean {
  const sort = (query.sort ?? "").trim().toLowerCase();
  const categories = getFastCategories(query);
  const subcategories = getFastSubcategories(query);
  return !query.q &&
    categories.every(isKnownFastCategory) &&
    subcategories.every(isKnownFastSubcategory) &&
    !query.category_level_3 &&
    !(query.category_level_3s?.length) &&
    query.radius_km == null &&
    query.near_lat == null &&
    query.near_lng == null &&
    query.price_min == null &&
    query.price_max == null &&
    !query.size &&
    !(query.sizes?.length) &&
    !query.brand &&
    !(query.brands?.length) &&
    !query.color &&
    !(query.colors?.length) &&
    !query.condition &&
    !(query.conditions?.length) &&
    !query.images &&
    !query.model &&
    query.seller_user_ids == null &&
    !(query.sellerKinds?.length) &&
    !query.list_category &&
    !(query.list_categories?.length) &&
    (sort === "" || sort === "newest" || sort === "date_desc");
}

function getNextListingsCursor(items: Record<string, unknown>[], hasMore: boolean): string | null {
  if (!hasMore || items.length === 0) return null;
  const last = items[items.length - 1];
  const createdAt = last.created_at;
  const id = last.id;
  if ((typeof createdAt !== "string" && !(createdAt instanceof Date)) || typeof id !== "string") {
    return null;
  }
  return encodeListingsCursor(createdAt, id);
}

function queryTargetsExecutari(query: ProductQuery): boolean {
  const categories = getFastCategories(query);
  return (
    query.scope === "executari" ||
    query.channel === "executari_insolventa" ||
    categories.includes("executari")
  );
}

function normalizeEnterpriseList(values: Array<string | null | undefined> | undefined, opts?: { keepAll?: boolean }): string[] {
  const out = (values ?? [])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value) => value && (opts?.keepAll || value !== "all"));
  return Array.from(new Set(out));
}

function normalizeEnterpriseSearchList(values: Array<string | null | undefined> | undefined): string[] {
  const out = (values ?? [])
    .map((value) => normalizeForSearch(String(value ?? "")))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function getEnterpriseStatusList(status: ProductQuery["status"]): string[] {
  if (Array.isArray(status) && status.length > 0) {
    return normalizeEnterpriseList(status, { keepAll: true });
  }
  if (typeof status === "string" && status.trim()) {
    return normalizeEnterpriseList(status.split(","), { keepAll: true });
  }
  return [...DEFAULT_STATUS];
}

function getEnterpriseLevel3Filters(query: ProductQuery): string[] {
  const sub = (query.subcategorie ?? query.subcategory ?? "").trim().toLowerCase();
  const values = normalizeEnterpriseList([
    ...(query.category_level_3s ?? []),
    query.category_level_3,
  ]);
  if (values.length === 0) return [];
  if (sub === "piese-auto") {
    return Array.from(new Set(values.flatMap((value) => getPieseAutoCategoryLevel3MatchVariants(value))));
  }
  return values.map(normalizeSubcategoryToKey);
}

function getEnterpriseConditionFilters(query: ProductQuery): string[] {
  const sub = (query.subcategorie ?? query.subcategory ?? "").trim().toLowerCase();
  const raw = normalizeEnterpriseList([
    ...(query.conditions ?? []),
    query.condition,
  ]);
  if (raw.length === 0) return [];
  if (sub === "piese-auto") {
    const normalized = Array.from(new Set(raw.map((value) => normalizeConditionForForm(value))));
    if (normalized.length >= 2) return [];
    if (normalized[0] === "Nou") return ["nou", "noua"];
    return ["second hand", "second-hand", "folosit", "utilizat"];
  }
  return normalizeEnterpriseSearchList(raw);
}

function getEnterpriseScalarFilter(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return null;
  return trimmed;
}

export function canUseEnterpriseSupabasePath(query: ProductQuery): boolean {
  if (!USE_PRODUCTS_CHANNEL) return false;
  if (query.listingsCursor) return false;
  if (
    query.radius_km != null ||
    query.near_lat != null ||
    query.near_lng != null
  ) {
    return false;
  }
  // Placeholder image URLs count as "without images" in the current JS matcher;
  // keep that edge case on the exact fallback path.
  if (query.images) return false;

  const sort = (query.sort ?? "").trim().toLowerCase();
  return (
    sort === "" ||
    sort === "relevant" ||
    sort === "newest" ||
    sort === "date_desc" ||
    sort === "oldest" ||
    sort === "date_asc" ||
    sort === "pricelow" ||
    sort === "price_asc" ||
    sort === "pricehigh" ||
    sort === "price_desc" ||
    sort === "title" ||
    sort === "timeleft"
  );
}

function buildEnterpriseRpcArgs(
  query: ProductQuery,
  access: AccessContext | undefined,
  includeExecutariCrosslist: boolean,
  limit: number,
): Record<string, unknown> {
  const categories = getQueryCategories(query);
  const subcategories = getQuerySubcategories(query);
  const categoryValues = normalizeEnterpriseSearchList(
    categories.flatMap((category) => [
      category,
      RO_CATEGORIES[category]?.name,
    ]),
  );
  const categoryExtraSubcategories = includeExecutariCrosslist
    ? normalizeEnterpriseList(categories.flatMap((category) => CATEGORY_EXTRA_SUBCATEGORIES[category] ?? []))
    : [];
  const listCategories = normalizeEnterpriseSearchList([
    ...(query.list_categories ?? []),
    query.list_category,
  ]);
  const sellerIds =
    query.seller_user_ids == null
      ? null
      : Array.from(new Set(query.seller_user_ids.map((id) => String(id).trim()).filter(Boolean)));

  return {
    p_q: (query.q ?? "").trim() || null,
    p_channel: query.channel ?? "ro",
    p_scope: query.scope ?? "all",
    p_include_executari: includeExecutariCrosslist,
    p_has_executari_access: access?.hasExecutariAccess === true,
    p_offset: Math.max(0, query.from ?? 0),
    p_limit: Math.min(101, Math.max(1, limit + 1)),
    p_statuses: getEnterpriseStatusList(query.status),
    p_categories: categories,
    p_category_values: categoryValues,
    p_category_extra_subcategories: categoryExtraSubcategories,
    p_subcategories: normalizeEnterpriseList(subcategories.flatMap(expandSubcategoryFilter)),
    p_level3s: getEnterpriseLevel3Filters(query),
    p_list_categories: listCategories,
    p_county: (query.county ?? "").trim() || null,
    p_city: (query.city ?? "").trim() || null,
    p_location: (query.location ?? "").trim() || null,
    p_price_min: query.price_min ?? null,
    p_price_max: query.price_max ?? null,
    p_sizes: normalizeEnterpriseList([...(query.sizes ?? []), query.size]),
    p_brands: normalizeEnterpriseList([...(query.brands ?? []), query.brand]),
    p_model: (query.model ?? "").trim() || null,
    p_colors: normalizeEnterpriseSearchList([...(query.colors ?? []), query.color]),
    p_conditions: getEnterpriseConditionFilters(query),
    p_product_type: getEnterpriseScalarFilter(query.product_type),
    p_sale_type: getEnterpriseScalarFilter(query.sale_type),
    p_images: null,
    p_seller_user_ids: sellerIds,
    p_seller_user_ids_exclude: query.seller_user_ids_exclude === true,
    p_free_only: query.freeOnly === true,
    p_fuel: getEnterpriseScalarFilter(query.fuel),
    p_body_type: getEnterpriseScalarFilter(query.bodyType),
    p_part_type: getEnterpriseScalarFilter(query.partType),
    p_department: getEnterpriseScalarFilter(query.department),
    p_apparel_type: getEnterpriseScalarFilter(query.apparelType),
    p_footwear_type: getEnterpriseScalarFilter(query.footwearType),
    p_accessory_type: getEnterpriseScalarFilter(query.accessoryType),
    p_sort: (query.sort ?? "newest").trim() || "newest",
  };
}

async function buildEnterpriseCacheKey(args: Record<string, unknown>): Promise<string> {
  const version = await getProductsDerivedDataVersion();
  const stableArgs = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return JSON.stringify({ version, args: stableArgs });
}

async function getRoListingsEnterpriseSupabase(
  query: ProductQuery,
  access?: AccessContext,
): Promise<RoListingsResult> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }

  const channel: RoChannel = (query.channel ?? "ro") as RoChannel;
  const scope = query.scope ?? "all";
  if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, nextCursor: null, hasMore: false };
  }
  if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, nextCursor: null, hasMore: false };
  }

  const from = Math.max(0, query.from ?? 0);
  const requestedLimit = query.limit ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const includeExecutariCrosslist =
    query.includeExecutariCrosslist === true || queryTargetsExecutari(query)
      ? await getRoExecutariCrosslistEnabled(true)
      : false;
  const args = buildEnterpriseRpcArgs(query, access, includeExecutariCrosslist, limit);
  const load = async (): Promise<RoListingsResult> => {
    const { data, error } = await runPostgrestQuery<Record<string, unknown>[]>(
      (signal) => supabaseAdmin!
        .rpc("search_ro_listings_enterprise", args)
        .abortSignal(signal),
      { timeoutMs: 4500, maxRetries: 0, retryDelayMs: 150 },
    );

    if (error) {
      const msg = typeof error.message === "string" ? error.message : "Enterprise Supabase listings query failed";
      throw new Error(msg);
    }

    const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const copy = { ...row };
      delete copy.enterprise_rank;
      return copy;
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    if (items.length > 0) {
      await applyUserProfileLocationFallback(items);
      await enrichItemsWithImageFocal(items);
    }

    return {
      items,
      nextFrom: from + items.length,
      nextCursor: getNextListingsCursor(items, hasMore && isListingsKeysetSortOrder(query.sort, query.q)),
      hasMore,
    };
  };

  const isPublicCacheable = access?.hasExecutariAccess !== true && !queryTargetsExecutari(query);
  if (!isPublicCacheable) {
    return load();
  }

  const cacheKey = await buildEnterpriseCacheKey(args);
  const { value } = await getOrLoadFromSharedTtlCache<RoListingsResult>(
    ENTERPRISE_LISTINGS_CACHE_NAMESPACE,
    cacheKey,
    {
      ttlMs: ENTERPRISE_LISTINGS_CACHE_TTL_MS,
      loader: load,
      waitForSharedMs: 900,
      lockMs: 5_000,
    },
  );
  return value;
}

/**
 * Număr total strict folosind RPC-ul SQL enterprise (aceleași filtre ca listarea).
 * Returnează null dacă query-ul nu e eligibil sau RPC eșuează — apelantul folosește count PostgREST.
 */
export async function countProductsViaEnterpriseRpc(
  query: ProductQuery,
  access?: AccessContext,
): Promise<number | null> {
  if (!USE_PRODUCTS_CHANNEL || !supabaseAdmin) return null;
  if (!canUseEnterpriseSupabasePath(query)) return null;

  const channel: RoChannel = (query.channel ?? "ro") as RoChannel;
  const scope = query.scope ?? "all";
  if (scope === "executari" && !access?.hasExecutariAccess) {
    return 0;
  }
  if (channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return 0;
  }

  const requestedLimit = query.limit ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const includeExecutariCrosslist =
    query.includeExecutariCrosslist === true || queryTargetsExecutari(query)
      ? await getRoExecutariCrosslistEnabled(true)
      : false;
  const args = buildEnterpriseRpcArgs(query, access, includeExecutariCrosslist, limit);

  const { data, error } = await runPostgrestQuery<unknown>(
    (signal) => supabaseAdmin!.rpc("count_ro_listings_enterprise", args).abortSignal(signal),
    { timeoutMs: 6500, maxRetries: 0, retryDelayMs: 250 },
  );

  if (error) {
    if (process.env.DEBUG_LISTINGS_COUNT === "1") {
      // eslint-disable-next-line no-console
      console.warn("[listings-count] count_ro_listings_enterprise:", error.message);
    }
    return null;
  }

  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (typeof data === "string" && /^\d+$/.test(data)) return Number(data);
  return null;
}

async function getRoListingsFastSupabase(
  query: ProductQuery,
  access?: AccessContext,
): Promise<RoListingsResult> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }
  const admin = supabaseAdmin;

  const channel: RoChannel = (query.channel ?? "ro") as RoChannel;
  const scope = query.scope ?? "all";
  const cat = normalizeFastTaxonomyValue(query.categorie);
  const categories = getFastCategories(query);
  const subcategories = getFastSubcategories(query);
  const includeExecutariCrosslist = query.includeExecutariCrosslist === true || queryTargetsExecutari(query);
  if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, hasMore: false };
  }
  if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, hasMore: false };
  }

  const from = Math.max(0, query.from ?? 0);
  const requestedLimit = query.limit ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const cursorDecoded =
    query.listingsCursor && isListingsKeysetSortOrder(query.sort, query.q)
      ? decodeListingsCursor(query.listingsCursor)
      : null;
  const cursorCreatedAt = cursorDecoded ? new Date(cursorDecoded.ca).toISOString() : null;
  const pageFrom = cursorDecoded ? 0 : from;
  const statusFilter = Array.isArray(query.status)
    ? query.status
    : (typeof query.status === "string" && query.status.trim()
      ? query.status.split(",").map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_STATUS]);

  const { data, error } = await runPostgrestQuery<Record<string, unknown>[]>(
    (signal) => {
      let q = admin
        .from("products")
        .select(LISTING_SELECT)
        .in("status", statusFilter)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageFrom, pageFrom + limit);

      if (cursorDecoded && cursorCreatedAt) {
        q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorDecoded.id})`);
      }

      if (USE_PRODUCTS_CHANNEL) {
        if (scope === "live_bid") {
          q = q.eq("channel", "ro");
        } else if (scope === "executari") {
          q = q.eq("channel", "executari_insolventa");
        } else if (cat === "executari" || categories.includes("executari")) {
          q = access?.hasExecutariAccess
            ? q.or("channel.eq.ro,channel.eq.executari_insolventa")
            : q.eq("channel", "ro");
        } else if (!includeExecutariCrosslist) {
          q = q.eq("channel", "ro");
        } else if (channel === "ro") {
          q = q.or("channel.eq.ro,channel.eq.executari_insolventa");
        } else {
          q = q.eq("channel", channel);
        }
      }

      if (query.product_type) {
        q = q.eq("product_type", query.product_type);
      }
      if (query.sale_type) {
        q = q.eq("sale_type", query.sale_type);
      }
      const fastCounty = cleanFastLocationPattern(query.county);
      const fastCity = cleanFastLocationPattern(query.city);
      const fastLocation = cleanFastLocationPattern(query.location);
      if (fastCounty) {
        q = q.ilike("county", `%${fastCounty}%`);
      }
      if (fastCity) {
        q = q.ilike("city", `%${fastCity}%`);
      }
      if (fastLocation && !fastCounty && !fastCity) {
        q = q.ilike("locality_search", `%${fastLocation}%`);
      }
      q = applyFastSupabaseTaxonomyFilters(q, categories, subcategories, includeExecutariCrosslist);

      return q.abortSignal(signal);
    },
    { timeoutMs: 6500, maxRetries: 0, retryDelayMs: 250 }
  );

  if (error) {
    const msg = typeof error.message === "string" ? error.message : "Supabase listings fast query failed";
    throw new Error(msg);
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  const hasMore = raw.length > limit;
  const items = hasMore ? raw.slice(0, limit) : raw;
  if (items.length > 0) {
    await applyUserProfileLocationFallback(items);
    await enrichItemsWithImageFocal(items);
  }

  return {
    items,
    nextFrom: from + items.length,
    nextCursor: getNextListingsCursor(items, hasMore && isListingsKeysetSortOrder(query.sort, query.q)),
    hasMore,
  };
}

async function getRoListingsFastPrismaFallback(
  query: ProductQuery,
  access?: AccessContext,
): Promise<RoListingsResult> {
  const channel: RoChannel = (query.channel ?? "ro") as RoChannel;
  const scope = query.scope ?? "all";
  const cat = normalizeFastTaxonomyValue(query.categorie);
  const categories = getFastCategories(query);
  const subcategories = getFastSubcategories(query);
  const includeExecutariCrosslist = query.includeExecutariCrosslist === true || queryTargetsExecutari(query);
  if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, nextCursor: null, hasMore: false };
  }
  if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, nextCursor: null, hasMore: false };
  }

  const from = Math.max(0, query.from ?? 0);
  const requestedLimit = query.limit ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const statusFilter = Array.isArray(query.status)
    ? query.status
    : (typeof query.status === "string" && query.status.trim()
      ? query.status.split(",").map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_STATUS]);

  const where: Prisma.productsWhereInput = {
    status: { in: statusFilter.filter((status) => status !== "deleted") as string[] },
  };

  if (USE_PRODUCTS_CHANNEL) {
    if (scope === "live_bid") {
      where.channel = "ro";
    } else if (scope === "executari") {
      where.channel = "executari_insolventa";
    } else if (cat === "executari" || categories.includes("executari")) {
      where.channel = access?.hasExecutariAccess ? { in: ["ro", "executari_insolventa"] } : "ro";
    } else if (!includeExecutariCrosslist) {
      where.channel = "ro";
    } else if (channel === "ro") {
      where.channel = { in: ["ro", "executari_insolventa"] };
    } else {
      where.channel = channel;
    }
  }

  if (query.product_type) where.product_type = query.product_type;
  if (query.sale_type) where.sale_type = query.sale_type;
  const taxonomyConditions = getFastPrismaTaxonomyConditions(categories, subcategories, includeExecutariCrosslist);
  if (taxonomyConditions.length > 0) {
    where.AND = taxonomyConditions;
  }

  const rows = await prisma.products.findMany({
    where,
    orderBy: [{ created_at: "desc" }],
    skip: from,
    take: limit + 1,
    select: LISTING_SELECT_OBJ,
  });

  const raw = rows as unknown as Record<string, unknown>[];
  const hasMore = raw.length > limit;
  const items = hasMore ? raw.slice(0, limit) : raw;
  if (items.length > 0) {
    await applyUserProfileLocationFallback(items);
    await enrichItemsWithImageFocal(items);
  }

  return {
    items,
    nextFrom: from + items.length,
    nextCursor: null,
    hasMore,
  };
}

/**
 * Fetch RO listings - Supabase by default, Prisma when USE_PRISMA_LISTINGS=true (dev only).
 * Same shape as /api/ro/listings response (items, nextFrom, hasMore).
 * Uses unstable_cache for default (no-filter) queries when access is undefined (unauthenticated).
 */
export async function getRoListings(query: ProductQuery, access?: AccessContext): Promise<RoListingsResult> {
  const resolved = await resolveSellerUserIdsForQuery(query);
  if (canUseEnterpriseSupabasePath(resolved)) {
    try {
      return await getRoListingsEnterpriseSupabase(resolved, access);
    } catch (error) {
      console.warn("[listingsRepo] Enterprise Supabase path failed. Falling back to legacy listings path.", {
        error,
        from: resolved.from,
        limit: resolved.limit,
        hasQ: !!resolved.q,
        category: resolved.categorie,
        subcategory: resolved.subcategorie ?? resolved.subcategory,
        sort: resolved.sort,
      });
    }
  }
  if (canUseFastSupabasePath(resolved)) {
    try {
      return await getRoListingsFastSupabase(resolved, access);
    } catch (error) {
      if (isRetryablePostgrestError(error)) {
        console.warn("[listingsRepo] Fast Supabase path failed. Falling back to a safer listings path.", error);
        if (USE_PRISMA && process.env.DATABASE_URL) {
          try {
            return await getRoListingsFastPrismaFallback(resolved, access);
          } catch (prismaError) {
            if (!isPrismaTransientListingsError(prismaError)) {
              throw prismaError;
            }
            console.warn("[listingsRepo] Prisma fast fallback also failed transiently. Falling back to Supabase scan.", prismaError);
          }
        }
        return await getRoListingsSupabase(resolved, access);
      }
      throw error;
    }
  }
  if (isCacheableDefaultQuery(resolved, access)) {
    const from = Math.max(0, resolved.from ?? 0);
    const limit = Math.min(100, Math.max(1, resolved.limit ?? 30));
    const cacheKey = `ro-listings:${from}:${limit}`;
    return unstable_cache(
      () => getRoListingsSupabase(resolved, access),
      [cacheKey],
      { revalidate: 120, tags: ["ro-listings"] }
    )();
  }
  if (process.env.DEBUG_LISTINGS === "1") {
    console.warn("[listingsRepo] Using legacy Supabase scan fallback", {
      from: resolved.from,
      limit: resolved.limit,
      hasQ: !!resolved.q,
      category: resolved.categorie,
      subcategory: resolved.subcategorie ?? resolved.subcategory,
      hasGeo: resolved.radius_km != null || resolved.near_lat != null || resolved.near_lng != null,
      images: resolved.images,
    });
  }
  return getRoListingsSupabase(resolved, access);
}

/**
 * Total count with the same strict filters as listări RO.
 * Default: PostgREST / enterprise RPC via `countProducts` (no Prisma).
 * With `USE_PRISMA_LISTINGS=true`: Prisma COUNT for parity testing.
 */
export async function getRoListingsCount(query: ProductQuery, access?: AccessContext): Promise<number> {
  if (!USE_PRISMA) {
    const { countProducts } = await import("@/lib/server/products/listingsCountRepo");
    type Strict = import("@/lib/server/products/listingsWhere").ProductQueryStrict;
    return countProducts(query as Strict, access);
  }
  const resolved = await resolveSellerUserIdsForQuery(query);
  const where = buildWhere(resolved, access);
  try {
    return await prisma.products.count({ where });
  } catch (error) {
    if (isPrismaTransientListingsError(error)) {
      return 0;
    }
    throw error;
  }
}

/** Optional overrides for Supabase listings (e.g. createdAfter for saved search alerts). */
export interface ListingsSupabaseOverrides {
  createdAfter?: string;
}

/**
 * Supabase implementation (default).
 * Exported for parity testing in scripts/compare_listings.ts.
 *
 * IMPORTANT: Pagination logic must remain offset-based for Supabase parity.
 * hasMore MUST remain: items.length === limit
 * nextFrom MUST remain: from + items.length
 * Do NOT convert to page-based or count-based pagination without coordinated frontend change.
 */
export async function getRoListingsSupabase(
  query: ProductQuery,
  access?: AccessContext,
  overrides?: ListingsSupabaseOverrides
): Promise<RoListingsResult> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }

  const channel: RoChannel = (query.channel ?? "ro") as RoChannel;
  const scope = query.scope ?? "all";
  const cat = (query.categorie ?? "").trim().toLowerCase();
  if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, hasMore: false };
  }
  if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access?.hasExecutariAccess) {
    return { items: [], nextFrom: 0, hasMore: false };
  }

  const from = Math.max(0, query.from ?? 0);
  const requestedLimit = query.limit ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const includeExecutariCrosslist =
    query.includeExecutariCrosslist === true || queryTargetsExecutari(query)
      ? await getRoExecutariCrosslistEnabled(true)
      : false;
  const target = from + limit;
  const statusFilter = Array.isArray(query.status)
    ? query.status
    : (typeof query.status === "string" && query.status.trim()
      ? query.status.split(",").map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_STATUS]);

  const needGeoRadiusScan =
    query.radius_km != null &&
    query.near_lat != null &&
    query.near_lng != null &&
    Number.isFinite(query.radius_km) &&
    Number.isFinite(query.near_lat) &&
    Number.isFinite(query.near_lng);
  const needFullSortScan =
    needGeoRadiusScan ||
    ["price_asc", "pricelow", "price_desc", "pricehigh", "title", "timeleft", "date_asc", "oldest"]
      .includes((query.sort ?? "").toLowerCase());

  const matched: Record<string, unknown>[] = [];
  let scanned = 0;
  let offset = 0;
  let exhausted = false;

  const buildBatchQuery = () => {
    let q = supabaseAdmin!
      .from("products")
      .select(LISTING_SELECT)
      .in("status", statusFilter)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + SUPABASE_SCAN_BATCH - 1);
    if (overrides?.createdAfter) {
      q = q.gte("created_at", overrides.createdAfter);
    }
    if (USE_PRODUCTS_CHANNEL) {
      if (scope === "live_bid") {
        q = q.eq("channel", "ro");
      } else if (scope === "executari") {
        q = q.eq("channel", "executari_insolventa");
      } else if (cat === "executari" || getQueryCategories(query).includes("executari")) {
        q = access?.hasExecutariAccess
          ? q.or("channel.eq.ro,channel.eq.executari_insolventa")
          : q.eq("channel", "ro");
      } else if (!includeExecutariCrosslist) {
        q = q.eq("channel", "ro");
      } else if (channel === "ro") {
        q = q.or("channel.eq.ro,channel.eq.executari_insolventa");
      } else {
        q = q.eq("channel", channel);
      }
    }
    return q;
  };

  while (scanned < SUPABASE_MAX_SCAN_ROWS) {
    let data: unknown = null;
    let lastError: unknown = null;
    let succeeded = false;
    for (let attempt = 0; attempt <= SUPABASE_LISTINGS_MAX_RETRIES; attempt += 1) {
      const { data: batchData, error: batchError } = await runPostgrestQuery<unknown>(
        (signal) => buildBatchQuery().abortSignal(signal),
        { timeoutMs: 6500, maxRetries: 0 }
      );
      if (!batchError) {
        data = batchData;
        lastError = null;
        succeeded = true;
        break;
      }
      lastError = batchError;
      if (!isRetryableSupabaseListingsError(batchError) || attempt === SUPABASE_LISTINGS_MAX_RETRIES) {
        break;
      }
      await listingsDelay(SUPABASE_LISTINGS_RETRY_DELAY_MS * (attempt + 1));
    }
    if (!succeeded) {
      if (lastError && isRetryableSupabaseListingsError(lastError)) {
        // Transient PostgREST/schema-cache/upstream timeout. Avoid crashing /ro; degrade gracefully.
        const errObj = lastError as { code?: unknown; message?: unknown };
        console.warn(
          "[listingsRepo] Transient Supabase error after retries. Returning partial results.",
          {
            code: typeof errObj.code === "string" ? errObj.code : undefined,
            message: typeof errObj.message === "string" ? errObj.message : undefined,
            matched: matched.length,
            scanned,
          }
        );
        exhausted = true;
        break;
      }
      const err = lastError as { message?: unknown } | null;
      const msg = err && typeof err.message === "string" ? err.message : "Supabase listings query failed";
      throw new Error(msg);
    }
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    if (batch.length === 0) {
      exhausted = true;
      break;
    }

    await applyUserProfileLocationFallback(batch);
    for (const row of batch) {
      if (rowMatchesSupabaseQuery(row, query, includeExecutariCrosslist)) matched.push(row);
    }

    scanned += batch.length;
    offset += SUPABASE_SCAN_BATCH;

    if (batch.length < SUPABASE_SCAN_BATCH) {
      exhausted = true;
      break;
    }
    if (!needFullSortScan && matched.length >= target + SUPABASE_SCAN_BATCH) {
      break;
    }
  }

  const sorted = sortSupabaseRows(matched, query.sort, query);
  const items = sorted.slice(from, from + limit);
  const hasMore = exhausted ? sorted.length > from + items.length : sorted.length >= from + limit;

  await applyUserProfileLocationFallback(items);
  await enrichItemsWithImageFocal(items);

  return {
    items,
    nextFrom: from + items.length,
    nextCursor: null,
    hasMore,
    totalMatched: sorted.length,
  };
}

/**
 * Prisma implementation - full filtering, search, progressive fallback.
 * Requires DATABASE_URL. Activate with USE_PRISMA_LISTINGS=true.
 * Exported for parity testing in scripts/compare_listings.ts.
 */
export async function getRoListingsPrisma(query: ProductQuery, access?: AccessContext): Promise<RoListingsResult> {
  const from = Math.max(0, query.from ?? 0);
  const requestedLimit = query.limit ?? query.pageSize ?? 30;
  const limit = Math.min(Math.max(1, requestedLimit), 100);

  const result = await runWithFallback(query, access);
  const imageFilteredItems =
    query.images != null
      ? (result.items as Record<string, unknown>[]).filter((row) =>
          rowMatchesImagesFilter(row, query.images)
        )
      : (result.items as Record<string, unknown>[]);

  if (process.env.DEBUG_LISTINGS) {
    console.debug("[listingsRepo] Prisma query", {
      from,
      limit,
      filters: {
        q: query.q,
        categorie: query.categorie,
        subcategorie: query.subcategorie,
        county: query.county,
        city: query.city,
      },
      total: imageFilteredItems.length,
      relaxed: result.meta?.relaxed,
      steps: result.meta?.relaxationSteps,
    });
  }

  await applyUserProfileLocationFallback(imageFilteredItems);
  await enrichItemsWithImageFocal(imageFilteredItems);

  return {
    ...result,
    items: imageFilteredItems,
  };
}
