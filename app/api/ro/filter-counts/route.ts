import { NextRequest, NextResponse } from "next/server";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { SUBCATEGORY_DISPLAY_TO_KEY } from "@/lib/categories";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { USE_PRODUCTS_CHANNEL } from "@/lib/server/products/listingsWhere";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";
import { canonicalizeExecutariSubcategory } from "@/lib/listings/executari-canonical-subcategory";
import {
  buildLastKnownGoodSnapshotKey,
  readFreshLastKnownGoodSnapshot,
  rememberLastKnownGoodSnapshot,
  shouldUseLastKnownGoodSnapshot,
} from "@/lib/server/lastKnownGoodSnapshot";
import { getProductsDerivedDataVersion } from "@/lib/server/products/derivedDataVersion";
import { getOrLoadFromSharedTtlCache } from "@/lib/server/sharedTtlCache";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Auth cookies that force no-store (no CDN cache).
 * Any route returning user-specific data MUST check auth and set Cache-Control: private, no-store
 * so authenticated responses are never edge-cached (Vercel/ISR).
 */
const AUTH_COOKIE_PATTERNS = [
  /executari_access\s*=/,
  /next-auth\.session-token\s*=/,
  /authjs\.session-token\s*=/,
  /__Secure-authjs\.session-token\s*=/,
];

type FilterCountsSuccessPayload = {
  success: true;
  categoryCounts: Record<string, number>;
  subcategoryCounts: Record<string, number>;
  locationCounts: Record<string, number>;
  rowsScanned: number;
  degraded?: true;
  stale?: true;
  snapshotAgeMs?: number;
};

function hasAuthOrCookies(request: NextRequest): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie?.trim()) return false;
  return AUTH_COOKIE_PATTERNS.some((re) => re.test(cookie));
}

type ProductRow = {
  category: string | null;
  subcategory: string | null;
  product_type: string | null;
  sale_type: string | null;
  sold_at: string | null;
  custom_fields: Record<string, unknown> | null;
};

type FilterCountsRollupRow = {
  category: string | null;
  subcategory: string | null;
  product_type: string | null;
  sale_type: string | null;
  visible_count: number | null;
};

const categoryKeys = Object.keys(RO_CATEGORIES).filter((k) => k !== "all");
const FILTER_COUNTS_SNAPSHOT_TTL_MS = 60_000;
const FILTER_COUNTS_SNAPSHOT_NAMESPACE = "api:ro-filter-counts";
const FILTER_COUNTS_CACHE_TTL_MS = 60_000;
const FILTER_COUNTS_CACHE_NAMESPACE = "cache:api:ro-filter-counts";

const normalizeForSearch = (value: string): string =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeSubcategoryToKey = (value: string): string => {
  if (!value) return "";
  const raw = value.trim().toLowerCase();
  if (!raw) return "";

  const toSlug = (s: string): string =>
    s
      .replace(/[ăâîșț]/g, (c) => ({ "ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t" }[c] || c))
      .replace(/\s+/g, "-");

  const availableKeys = new Set(Object.values(SUBCATEGORY_DISPLAY_TO_KEY));
  if (availableKeys.has(raw)) return raw;

  for (const [display, key] of Object.entries(SUBCATEGORY_DISPLAY_TO_KEY)) {
    const displayNorm = (display || "").toLowerCase();
    if (displayNorm === raw || toSlug(displayNorm) === toSlug(raw)) return key;
  }

  return toSlug(raw);
};

const EXECUTARI_CROSSLIST_CATEGORY_BY_SUBCATEGORY: Record<string, string> = {
  "exec-imobiliare": "imobiliare",
  "exec-autovehicule": "autovehicule",
  "exec-industrial": "utilaje",
  "exec-afaceri": "business",
  "exec-office": "business",
};

function getExecutariCrosslistCategoryKey(row: ProductRow): string {
  const subKey = normalizeSubcategoryToKey(String(row.subcategory || ""));
  const mapped = EXECUTARI_CROSSLIST_CATEGORY_BY_SUBCATEGORY[subKey];
  if (mapped) return mapped;

  const productTypeNorm = normalizeForSearch(String(row.product_type || ""));
  const saleTypeNorm = normalizeForSearch(String(row.sale_type || ""));
  if (
    productTypeNorm === "licitatii-publice" ||
    saleTypeNorm === "licitatii-insolventa" ||
    saleTypeNorm === "licitatie-publica"
  ) {
    return "diverse";
  }

  return "";
}

const isExecutariLike = (row: ProductRow): boolean => {
  const catNorm = normalizeForSearch(String(row.category || ""));
  const productTypeNorm = normalizeForSearch(String(row.product_type || ""));
  const saleTypeNorm = normalizeForSearch(String(row.sale_type || ""));

  return (
    catNorm === "executari" ||
    catNorm.includes("executari") ||
    productTypeNorm === "licitatii-publice" ||
    saleTypeNorm === "licitatii-insolventa" ||
    saleTypeNorm === "licitatie-publica"
  );
};

const buildCategoryNameMap = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const [key, entry] of Object.entries(RO_CATEGORIES)) {
    if (key === "all") continue;
    map.set(normalizeForSearch(entry.name), key);
  }
  return map;
};

const resolvePrimaryCategoryKey = (row: ProductRow, categoryNameMap: Map<string, string>): string => {
  const categoryRaw = String(row.category || "").trim();
  if (!categoryRaw) return "";
  if (RO_CATEGORIES[categoryRaw]) return categoryRaw;

  const normalized = normalizeForSearch(categoryRaw);
  if (categoryNameMap.has(normalized)) return categoryNameMap.get(normalized) || "";
  return "";
};

const getCategoryKeysForRow = (
  row: ProductRow,
  categoryNameMap: Map<string, string>,
  includeExecutariCrosslist: boolean,
): string[] => {
  const keys = new Set<string>();
  const primary = resolvePrimaryCategoryKey(row, categoryNameMap);
  if (primary) keys.add(primary);

  if (isExecutariLike(row)) {
    keys.add("executari");
    if (includeExecutariCrosslist) {
      const crosslistCategory = getExecutariCrosslistCategoryKey(row);
      if (crosslistCategory) keys.add(crosslistCategory);
    }
  }

  return Array.from(keys).filter((key) => !!key && key !== "all" && !!RO_CATEGORIES[key]);
};

const resolveSubcategoryForCategory = (row: ProductRow, selectedCategory: string): string => {
  const allowed = new Set(RO_CATEGORIES[selectedCategory]?.subcategories || []);
  if (allowed.size === 0) return "";

  const subKey = normalizeSubcategoryToKey(String(row.subcategory || ""));
  if (allowed.has(subKey)) return subKey;

  // Pentru categoria "executari": multe listări au subcategory brut (ex: "lichidari-firme",
  // "utilaje-constructii"). Le mapăm la subcategoriile canonice afișate în sidebar
  // ca să nu ne piardem din numărători (~5% din executari ar fi rămas la 0 fără asta).
  if (selectedCategory === "executari" && isExecutariLike(row)) {
    const canonical = canonicalizeExecutariSubcategory(subKey);
    return allowed.has(canonical) ? canonical : "";
  }

  return "";
};

function buildZeroCountsPayload(selectedCategory: string) {
  const categoryCounts: Record<string, number> = Object.fromEntries(categoryKeys.map((key) => [key, 0]));
  const subcategoryCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  if (selectedCategory !== "all" && RO_CATEGORIES[selectedCategory]) {
    for (const subKey of RO_CATEGORIES[selectedCategory].subcategories) subcategoryCounts[subKey] = 0;
  }
  return {
    success: true as const,
    categoryCounts,
    subcategoryCounts,
    locationCounts,
    rowsScanned: 0,
    degraded: true as const,
  };
}

function buildFilterCountsSnapshotKey(args: {
  selectedCategory: string;
  channel: string;
  scope: string;
  hasExecutariAccess: boolean;
  includeExecutariCrosslist: boolean;
}): string {
  return buildLastKnownGoodSnapshotKey({
    route: "/api/ro/filter-counts",
    selectedCategory: args.selectedCategory || "all",
    channel: args.channel || "ro",
    scope: args.scope || "all",
    hasExecutariAccess: args.hasExecutariAccess,
    includeExecutariCrosslist: args.includeExecutariCrosslist,
  });
}

function buildPayloadFromCountRows(
  rows: Array<ProductRow & { visible_count?: number | null }>,
  selectedCategory: string,
  includeExecutariCrosslist = false,
): FilterCountsSuccessPayload {
  const includeSubcategoryCounts = selectedCategory !== "all" && !!RO_CATEGORIES[selectedCategory];
  const categoryNameMap = buildCategoryNameMap();
  const categoryCounts: Record<string, number> = Object.fromEntries(categoryKeys.map((key) => [key, 0]));
  const subcategoryCounts: Record<string, number> = {};
  let rowsScanned = 0;

  if (includeSubcategoryCounts) {
    for (const subKey of RO_CATEGORIES[selectedCategory].subcategories) {
      subcategoryCounts[subKey] = 0;
    }
  }

  for (const row of rows) {
    const weight = Math.max(0, Number(row.visible_count ?? 1) || 0);
    rowsScanned += weight;
    const rowCategoryKeys = getCategoryKeysForRow(row, categoryNameMap, includeExecutariCrosslist);
    for (const key of rowCategoryKeys) {
      categoryCounts[key] = (categoryCounts[key] || 0) + weight;
    }

    if (includeSubcategoryCounts && rowCategoryKeys.includes(selectedCategory)) {
      const resolvedSubcategory = resolveSubcategoryForCategory(row, selectedCategory);
      if (resolvedSubcategory) {
        subcategoryCounts[resolvedSubcategory] = (subcategoryCounts[resolvedSubcategory] || 0) + weight;
      }
    }
  }

  return {
    success: true,
    categoryCounts,
    subcategoryCounts,
    locationCounts: {},
    rowsScanned,
  };
}

async function buildFilterCountsPayloadFromRollup(args: {
  selectedCategory: string;
  channel: string;
  scope: string;
  includeExecutariCrosslist: boolean;
}): Promise<FilterCountsSuccessPayload | null> {
  const admin = supabaseAdmin!;
  const channelBucket = args.channel === "executari_insolventa" ? "executari_insolventa" : "ro";
  const { data, error } = await runPostgrestQuery<FilterCountsRollupRow[]>(
    (signal) =>
      admin
        .from("product_filter_counts_rollup")
        .select("category, subcategory, product_type, sale_type, visible_count")
        .eq("scope_key", args.scope)
        .eq("channel_bucket", channelBucket)
        .abortSignal(signal),
    { timeoutMs: 2500, maxRetries: 0 },
  );

  if (error) {
    if (error.code === "42P01" || (error.message || "").toLowerCase().includes("product_filter_counts_rollup")) {
      return null;
    }
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const rows = ((data ?? []) as FilterCountsRollupRow[]).map((row) => ({
    category: row.category,
    subcategory: row.subcategory,
    product_type: row.product_type,
    sale_type: row.sale_type,
    sold_at: null,
    custom_fields: null,
    visible_count: row.visible_count,
  }));

  const payload = buildPayloadFromCountRows(rows, args.selectedCategory, args.includeExecutariCrosslist);
  return payload;
}

async function buildFilterCountsPayload(args: {
  selectedCategory: string;
  channel: string;
  scope: string;
  includeExecutariCrosslist: boolean;
}): Promise<FilterCountsSuccessPayload> {
  const rollupPayload = await buildFilterCountsPayloadFromRollup(args);
  if (rollupPayload) {
    return rollupPayload;
  }
  // The rollup is now the source of truth for this route. Falling back to a live
  // products scan is exactly what overloaded PostgREST during imports/bursts.
  return buildZeroCountsPayload(args.selectedCategory);
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Supabase admin client not configured" }, { status: 500 });
    }

    const channelParam = request.nextUrl.searchParams.get("channel")?.trim()?.toLowerCase();
    const channel = channelParam === "executari_insolventa" ? "executari_insolventa" : "ro";
    const scopeParam = request.nextUrl.searchParams.get("scope")?.trim()?.toLowerCase();
    const scope = scopeParam === "live_bid" || scopeParam === "executari" ? scopeParam : "all";
    const access = await resolveAccess(request);
    if (USE_PRODUCTS_CHANNEL && scope === "executari" && !access.hasExecutariAccess) {
      const categoryCounts: Record<string, number> = Object.fromEntries(categoryKeys.map((key) => [key, 0]));
      return NextResponse.json({
        success: true,
        categoryCounts,
        subcategoryCounts: {},
        rowsScanned: 0,
      });
    }
    if (USE_PRODUCTS_CHANNEL && channel === "executari_insolventa" && !access.hasExecutariAccess) {
      const categoryCounts: Record<string, number> = Object.fromEntries(categoryKeys.map((key) => [key, 0]));
      return NextResponse.json({
        success: true,
        categoryCounts,
        subcategoryCounts: {},
        rowsScanned: 0,
      });
    }

    const selectedCategory = (request.nextUrl.searchParams.get("category") || "all").trim().toLowerCase();
    const includeExecutariCrosslist = request.nextUrl.searchParams.get("includeExecutari") === "1";
    const version = await getProductsDerivedDataVersion();
    const snapshotKey = buildFilterCountsSnapshotKey({
      selectedCategory,
      channel,
      scope,
      hasExecutariAccess: access.hasExecutariAccess,
      includeExecutariCrosslist,
    });
    const cacheKey = buildLastKnownGoodSnapshotKey({
      snapshotKey,
      version,
    });
    const { value: payload } = await getOrLoadFromSharedTtlCache<FilterCountsSuccessPayload>(
      FILTER_COUNTS_CACHE_NAMESPACE,
      cacheKey,
      {
        ttlMs: FILTER_COUNTS_CACHE_TTL_MS,
        loader: async () => {
          const nextPayload = await buildFilterCountsPayload({
            selectedCategory,
            channel,
            scope,
            includeExecutariCrosslist,
          });
          rememberLastKnownGoodSnapshot(FILTER_COUNTS_SNAPSHOT_NAMESPACE, snapshotKey, nextPayload);
          return nextPayload;
        },
      },
    );

    const response = NextResponse.json(payload);
    const isAuthenticated = hasAuthOrCookies(request);
    response.headers.set(
      "Cache-Control",
      isAuthenticated
        ? "private, no-store, no-cache, must-revalidate"
        : "public, s-maxage=60, stale-while-revalidate=120"
    );
    return response;
  } catch (error: unknown) {
    const selectedCategory = (request.nextUrl.searchParams.get("category") || "all").trim().toLowerCase();
    const channelParam = request.nextUrl.searchParams.get("channel")?.trim()?.toLowerCase();
    const channel = channelParam === "executari_insolventa" ? "executari_insolventa" : "ro";
    const scopeParam = request.nextUrl.searchParams.get("scope")?.trim()?.toLowerCase();
    const scope = scopeParam === "live_bid" || scopeParam === "executari" ? scopeParam : "all";
    const access = await resolveAccess(request).catch(() => ({ hasExecutariAccess: false }));
    const includeExecutariCrosslist = request.nextUrl.searchParams.get("includeExecutari") === "1";
    const snapshotKey = buildFilterCountsSnapshotKey({
      selectedCategory,
      channel,
      scope,
      hasExecutariAccess: !!access.hasExecutariAccess,
      includeExecutariCrosslist,
    });
    if (shouldUseLastKnownGoodSnapshot(error)) {
      console.warn("[filter-counts] Unexpected transient error; serving stale snapshot:", error);
      const snapshot = readFreshLastKnownGoodSnapshot<FilterCountsSuccessPayload>(
        FILTER_COUNTS_SNAPSHOT_NAMESPACE,
        snapshotKey,
        FILTER_COUNTS_SNAPSHOT_TTL_MS,
      );
      if (snapshot) {
        return NextResponse.json(
          { ...snapshot.value, degraded: true, stale: true, snapshotAgeMs: snapshot.ageMs },
          { status: 200 },
        );
      }
      return NextResponse.json(buildZeroCountsPayload(selectedCategory), { status: 200 });
    }

    console.error("[filter-counts] Unexpected non-transient error:", error);
    return NextResponse.json({ success: false, error: "filter-counts failed" }, { status: 500 });
  }
}
