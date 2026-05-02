import { NextRequest, NextResponse } from "next/server";
import { normalizeRoListingsSearchParams } from "@/lib/ro/normalizedListingsQuery";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { countProducts, countProductsWithEstimateMeta } from "@/lib/server/products/listingsCountRepo";
import { buildLastKnownGoodSnapshotKey } from "@/lib/server/lastKnownGoodSnapshot";
import { getProductsDerivedDataVersion } from "@/lib/server/products/derivedDataVersion";
import { getOrLoadFromSharedTtlCache } from "@/lib/server/sharedTtlCache";

/** Aliniat cu volatilitate moderată a catalogului — reduce presiunea pe DB pentru același filtru. */
const LISTINGS_COUNT_CACHE_TTL_MS = 120_000;
const LISTINGS_COUNT_CACHE_NAMESPACE = "cache:api:ro-listings-count";
const COUNT_IGNORED_PARAM_KEYS = new Set(["from", "limit", "page", "cursor", "sort"]);

function getCountCacheSearchParamsEntries(searchParams: URLSearchParams): [string, string][] {
  const countParams = new URLSearchParams(searchParams.toString());
  for (const key of COUNT_IGNORED_PARAM_KEYS) {
    countParams.delete(key);
  }
  return Array.from(countParams.entries()).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * GET /api/ro/listings-count
 * Returns strict total count for the same filters as /api/ro/listings (no progressive relax).
 * Query params: same as listings (channel, q, category, subcategory, county, city, brand, model, etc.).
 * from/limit/sort are ignored for count. Channel + token gating applied (same as listings).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { query, searchParams: normalizedSearchParams } = normalizeRoListingsSearchParams(searchParams);
    const access = await resolveAccess(request);
    const searchParamsEntries = getCountCacheSearchParamsEntries(normalizedSearchParams);
    const version = await getProductsDerivedDataVersion();
    const cacheKey = buildLastKnownGoodSnapshotKey({
      route: "/api/ro/listings-count",
      version,
      searchParams: searchParamsEntries,
      hasExecutariAccess: access.hasExecutariAccess,
    });

    const exact = searchParams.get("exact") === "1";
    const { value: payload } = await getOrLoadFromSharedTtlCache<{ total: number; total_kind?: string }>(
      LISTINGS_COUNT_CACHE_NAMESPACE,
      cacheKey + (exact ? ":exact" : ":estimate"),
      {
        ttlMs: LISTINGS_COUNT_CACHE_TTL_MS,
        loader: async () =>
          exact
            ? { total: await countProducts(query, access), total_kind: "exact" }
            : countProductsWithEstimateMeta(query, access),
      },
    );

    if (process.env.DEBUG_LISTINGS_COUNT === "1") {
      // eslint-disable-next-line no-console
      console.debug("[listings-count] total", payload.total, payload.total_kind);
    }

    const res = NextResponse.json(
      { success: true, total: payload.total, ...(payload.total_kind ? { total_kind: payload.total_kind } : {}) },
      { status: 200 },
    );
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (process.env.DEBUG_LISTINGS_COUNT === "1") {
      // eslint-disable-next-line no-console
      console.warn("[listings-count] error", message);
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export const revalidate = 0;
