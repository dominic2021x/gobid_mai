/**
 * Build ProductQuery from URL searchParams. Shared by /api/ro/listings and /api/admin/recategorizare/listings.
 */

import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import { stripBrandTokensFromSearchQuery } from "./searchQueryBrand";
import { RO_LISTINGS_PAGE_SIZE_DESKTOP } from "../../ro/roListingsPagination";

function parseListParam(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumberParam(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

const ALLOWED_SORT = new Set([
  "relevant",
  "newest",
  "oldest",
  "timeleft",
  "priceLow",
  "priceHigh",
  "title",
  "price_asc",
  "price_desc",
  "date_asc",
  "date_desc",
  "timeleft",
]);
const ALLOWED_STATUS = new Set(["active", "reserved", "sold", "in_progress", "deleted"]);

export function buildQueryFromParams(searchParams: URLSearchParams): {
  query: ProductQuery;
  hasFilters: boolean;
} {
  const listingsCursorRaw = searchParams.get("cursor")?.trim();
  const listingsCursor =
    listingsCursorRaw && listingsCursorRaw.length > 0 ? listingsCursorRaw : undefined;
  const requestedLimit = Number(searchParams.get("limit") ?? RO_LISTINGS_PAGE_SIZE_DESKTOP) || RO_LISTINGS_PAGE_SIZE_DESKTOP;
  const limit = Math.min(Math.max(1, requestedLimit), 100);
  const page = parseNumberParam(searchParams.get("page"));
  const pageSize = parseNumberParam(searchParams.get("pageSize"));

  /** Dacă lipsește `from` în URL, derivăm din `page` (offset = (page − 1) × limit). */
  const hasFromParam = searchParams.has("from");
  const rawFromWhenPresent = Math.max(0, Number(searchParams.get("from") ?? 0) || 0);
  let effectiveFrom = 0;
  if (listingsCursor) {
    effectiveFrom = 0;
  } else if (hasFromParam) {
    effectiveFrom = rawFromWhenPresent;
  } else if (typeof page === "number" && page >= 1) {
    effectiveFrom = (page - 1) * limit;
  }

  const channelParam = searchParams.get("channel")?.trim()?.toLowerCase();
  const channel = channelParam === "executari_insolventa" ? "executari_insolventa" : "ro";

  /** Scope: all = both live_bid + licitatii publice; live_bid = only anunțuri fără tokeni; executari = only Executări și Insolvență */
  const scopeParam = searchParams.get("scope")?.trim()?.toLowerCase();
  const scope =
    scopeParam === "live_bid" || scopeParam === "executari" ? scopeParam : undefined;
  const includeExecutariParam = searchParams.get("includeExecutari")?.trim().toLowerCase();
  const includeExecutariCrosslist =
    includeExecutariParam === "1" ||
    includeExecutariParam === "true" ||
    includeExecutariParam === "on" ||
    includeExecutariParam === "yes";

  // ✅ NOU: titleSearch (UI) -> q (backend)
  const titleSearch = searchParams.get("titleSearch")?.trim() || undefined;
  const titleSearchMode = searchParams.get("titleSearchMode")?.trim() || undefined; // optional (nu-l folosim aici)

  // q: dacă există q direct, îl păstrăm; altfel folosim titleSearch
  const qDirect = searchParams.get("q")?.trim() || undefined;
  const qRawCombined = (qDirect ?? titleSearch)?.trim() || undefined;

  const categories = parseListParam(searchParams.get("categories"))
    .map((s) => s.toLowerCase())
    .filter((s) => s && s !== "all");
  const categorie = categories.length === 1
    ? categories[0]
    : searchParams.get("category")?.trim() || searchParams.get("categorie")?.trim() || undefined;
  const subcategories = parseListParam(searchParams.get("subcategories"))
    .map((s) => s.toLowerCase())
    .filter((s) => s && s !== "all");
  const subcategorie =
    subcategories.length === 1
      ? subcategories[0]
      : searchParams.get("subcategory")?.trim() || searchParams.get("subcategorie")?.trim() || undefined;
  const level3sRaw = parseListParam(searchParams.get("level3s"));
  const category_level_3_single =
    searchParams.get("level3")?.trim() || searchParams.get("category_level_3")?.trim() || undefined;
  const category_level_3 = category_level_3_single;
  const category_level_3s = level3sRaw.length > 0 ? level3sRaw : undefined;

  const execCatRaw = searchParams.get("execCat")?.trim();
  const execCatsRaw = searchParams.get("execCats")?.trim();
  const list_categories = execCatsRaw
    ? execCatsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : execCatRaw
      ? [execCatRaw]
      : undefined;

  const county = searchParams.get("county")?.trim() || undefined;
  const city = searchParams.get("city")?.trim() || undefined;
  const location = searchParams.get("location")?.trim() || undefined;

  const radiusKmParsed = parseNumberParam(searchParams.get("radiusKm"));
  const radius_km =
    radiusKmParsed != null && radiusKmParsed > 0 && radiusKmParsed <= 500 ? radiusKmParsed : undefined;
  const nearLatParsed = parseNumberParam(searchParams.get("nearLat"));
  const nearLngParsed = parseNumberParam(searchParams.get("nearLng"));
  const near_lat =
    nearLatParsed != null && Number.isFinite(nearLatParsed) && Math.abs(nearLatParsed) <= 90 ? nearLatParsed : undefined;
  const near_lng =
    nearLngParsed != null && Number.isFinite(nearLngParsed) && Math.abs(nearLngParsed) <= 180 ? nearLngParsed : undefined;

  const price_min =
    parseNumberParam(searchParams.get("priceMin")) ?? parseNumberParam(searchParams.get("price_min"));
  const price_max =
    parseNumberParam(searchParams.get("priceMax")) ?? parseNumberParam(searchParams.get("price_max"));

  const size = searchParams.get("size")?.trim() || undefined;
  const sizes = parseListParam(searchParams.get("sizes"));

  const brand = searchParams.get("brand")?.trim() || undefined;
  const brands = parseListParam(searchParams.get("brands"));

  /** Strip la marcă doar când e selectată în filtre; altfel păstrăm tot `q` ca să potrivească și marca din titlu/câmp (ex. „baterie bmw”). */
  const hasBrandFilter =
    (!!brand && brand.length > 0 && brand.toLowerCase() !== "all") || brands.length > 0;
  const q = hasBrandFilter
    ? stripBrandTokensFromSearchQuery(qRawCombined, brand, brands.length > 0 ? brands : undefined)
    : qRawCombined;

  const color = searchParams.get("color")?.trim() || undefined;
  const colors = parseListParam(searchParams.get("colors"));

  const condition = searchParams.get("condition")?.trim() || undefined;
  const conditions = parseListParam(searchParams.get("conditions"));
  const imagesParam = searchParams.get("images")?.trim().toLowerCase();
  const images = imagesParam === "with" || imagesParam === "without" ? imagesParam : undefined;

  const model = searchParams.get("model")?.trim() || undefined;

  const product_type =
    searchParams.get("product_type")?.trim() || searchParams.get("productType")?.trim() || undefined;
  const sale_type =
    searchParams.get("sale_type")?.trim() || searchParams.get("saleType")?.trim() || undefined;

  const fuel = searchParams.get("fuel")?.trim() || undefined;
  const bodyType = searchParams.get("bodyType")?.trim() || undefined;
  const partType = searchParams.get("partType")?.trim() || undefined;
  const department = searchParams.get("department")?.trim() || undefined;
  const apparelType = searchParams.get("apparelType")?.trim() || undefined;
  const footwearType = searchParams.get("footwearType")?.trim() || undefined;
  const accessoryType = searchParams.get("accessoryType")?.trim() || undefined;

  const vanzatorRaw = parseListParam(searchParams.get("vanzator"));
  const sellerKinds = Array.from(
    new Set(
      vanzatorRaw
        .map((v) => v.trim().toLowerCase())
        .filter((v): v is "particular" | "companie" => v === "particular" || v === "companie"),
    ),
  );
  const sellerKindsParam = sellerKinds.length > 0 ? sellerKinds : undefined;

  const freeOnlyRaw =
    searchParams.get("freeOnly")?.trim().toLowerCase() ??
    searchParams.get("free")?.trim().toLowerCase() ??
    "";
  const freeOnly =
    freeOnlyRaw === "1" ||
    freeOnlyRaw === "true" ||
    freeOnlyRaw === "on" ||
    freeOnlyRaw === "yes";

  const sortRaw = searchParams.get("sort")?.trim() || undefined;
  const sort = sortRaw && ALLOWED_SORT.has(sortRaw) ? sortRaw : undefined;

  const statusParam = searchParams.get("status");
  const statusParsed = statusParam ? parseListParam(statusParam) : undefined;
  const status = statusParsed?.filter((s) => ALLOWED_STATUS.has(s)).length ? statusParsed : undefined;

  // ✅ IMPORTANT: q include și titleSearch → deci hasFilters devine true
  const hasFilters =
    !!qRawCombined ||
    !!categorie ||
    categories.length > 0 ||
    !!subcategorie ||
    subcategories.length > 0 ||
    !!category_level_3 ||
    (category_level_3s != null && category_level_3s.length > 0) ||
    (list_categories != null && list_categories.length > 0) ||
    !!county ||
    !!city ||
    !!location ||
    radius_km != null ||
    (near_lat != null && near_lng != null) ||
    price_min != null ||
    price_max != null ||
    !!size ||
    sizes.length > 0 ||
    !!brand ||
    brands.length > 0 ||
    !!color ||
    colors.length > 0 ||
    !!condition ||
    conditions.length > 0 ||
    !!images ||
    !!model ||
    !!product_type ||
    !!sale_type ||
    !!scope ||
    includeExecutariCrosslist ||
    !!fuel ||
    !!bodyType ||
    !!partType ||
    !!department ||
    !!apparelType ||
    !!footwearType ||
    !!accessoryType ||
    (status != null && status.length > 0) ||
    sellerKinds.length === 1 ||
    freeOnly;

  const query: ProductQuery = {
    channel,
    scope,
    includeExecutariCrosslist,
    from: listingsCursor ? 0 : effectiveFrom,
    limit: pageSize ?? limit,
    page,
    pageSize: pageSize ?? limit,
    listingsCursor,
    q,
    // dacă vrei să îl folosești în repo mai târziu, îl poți pune în query ca extra,
    // dar doar dacă ProductQuery îl acceptă. Altfel lasă-l nefolosit.
    // qMode: titleSearchMode,

    categorie,
    categories: categories.length > 1 ? categories : undefined,
    subcategorie,
    subcategory: subcategorie,
    subcategories: subcategories.length > 1 ? subcategories : undefined,
    category_level_3,
    category_level_3s,
    list_category: list_categories?.length === 1 ? list_categories[0] : undefined,
    list_categories: (list_categories?.length ?? 0) > 1 ? list_categories : undefined,
    county,
    city,
    location,
    radius_km,
    near_lat: near_lat != null && near_lng != null ? near_lat : undefined,
    near_lng: near_lat != null && near_lng != null ? near_lng : undefined,
    price_min,
    price_max,
    size,
    sizes: sizes.length > 0 ? sizes : undefined,
    brand,
    brands: brands.length > 0 ? brands : undefined,
    color,
    colors: colors.length > 0 ? colors : undefined,
    condition,
    conditions: conditions.length > 0 ? conditions : undefined,
    images,
    model,
    product_type,
    sale_type,
    status,
    sort,
    fuel,
    bodyType,
    partType,
    department,
    apparelType,
    footwearType,
    accessoryType,
    sellerKinds: sellerKindsParam,
    freeOnly: freeOnly ? true : undefined,
  };

  return { query, hasFilters };
}