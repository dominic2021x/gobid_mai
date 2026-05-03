import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { Redis } from "@upstash/redis";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { getRoListings } from "@/lib/server/products/listingsRepo";
import { countProductsWithEstimateMeta } from "@/lib/server/products/listingsCountRepo";
import type { RoListingsTotalKind } from "@/lib/server/products/listingsCountRepo";
import { normalizeRoListingsSearchParams } from "@/lib/ro/normalizedListingsQuery";
import { RO_LISTINGS_PAGE_SIZE_DESKTOP } from "@/lib/ro/roListingsPagination";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Node runtime: hot path uses optional Upstash Redis (same env as other features). Not Edge — listings stack uses Node-only deps. */
export const runtime = "nodejs";

const USE_PRISMA = process.env.USE_PRISMA_LISTINGS === "true";

const getCachedListings = unstable_cache(
  async (from: number, limit: number) => getRoListings({ from, limit }),
  ["ro-listings"],
  { revalidate: 120, tags: ["ro-listings"] },
);

const RO_LISTINGS_KV_TTL_SEC = 30;
const RO_LISTINGS_KV_PREFIX = "ro:listings:v1:";

function getRoListingsRedis(): Redis | null {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

/** Auth/session cookie names that force no-store (no CDN cache). */
const AUTH_COOKIE_PATTERNS = [
  /executari_access\s*=/,
  /next-auth\.session-token\s*=/,
  /authjs\.session-token\s*=/,
  /__Secure-authjs\.session-token\s*=/,
];

function hasAuthOrCookies(request: NextRequest): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie?.trim()) return false;
  return AUTH_COOKIE_PATTERNS.some((re) => re.test(cookie));
}

export async function GET(request: NextRequest) {
  try {
    if (!USE_PRISMA && !supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Supabase admin client not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "1";
    const explicitMode =
      searchParams.get("mode") === "instant"
        ? "instant"
        : searchParams.get("mode") === "background"
          ? "background"
          : null;

    if (fresh) {
      const auth = await requireAdmin(request);
      if (!auth.ok) return auth.response;
    }

    const { query, hasFilters, cacheKey } = normalizeRoListingsSearchParams(searchParams);
    /**
     * Location-filtered first paint matches /api/search/results — return items+hasMore as fast as
     * possible, defer the total. Client polls /api/ro/listings-count in parallel for the badge.
     * This cuts first-paint to a single RPC even with city/county/radius filters.
     */
    const hasLocationFilter =
      Boolean((query.county ?? "").trim()) ||
      Boolean((query.city ?? "").trim()) ||
      Boolean((query.location ?? "").trim()) ||
      (typeof query.radius_km === "number" && Number.isFinite(query.radius_km) && query.radius_km > 0) ||
      (typeof query.near_lat === "number" && Number.isFinite(query.near_lat));
    const mode = explicitMode ?? (hasLocationFilter ? "instant" : null);
    const access = await resolveAccess(request);

    if (process.env.DEBUG_LISTINGS === "1") {
      console.debug("[listings] GET", {
        from: query.from,
        limit: query.limit,
        channel: query.channel,
        hasFilters,
        q: query.q ? "(set)" : undefined,
        category: query.categorie ?? undefined,
        county: query.county ?? undefined,
      });
    }

    const isAuthenticated = hasAuthOrCookies(request);
    const useCache =
      !fresh &&
      !isAuthenticated &&
      !hasFilters &&
      !query.listingsCursor &&
      query.channel !== "executari_insolventa";

    const redis = getRoListingsRedis();
    const redisKey =
      redis && !fresh && !isAuthenticated && !hasFilters && !query.listingsCursor
        ? `${RO_LISTINGS_KV_PREFIX}${cacheKey}`
        : null;

    if (redis && redisKey) {
      try {
        const hit = await redis.get<string>(redisKey);
        if (hit) {
          const parsed = JSON.parse(hit) as Record<string, unknown>;
          const res = NextResponse.json(parsed);
          res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
          res.headers.set("x-ro-listings-cache", "kv-hit");
          return res;
        }
      } catch {
        // ignore KV errors
      }
    }

    let result = useCache
      ? await getCachedListings(query.from ?? 0, query.limit ?? RO_LISTINGS_PAGE_SIZE_DESKTOP)
      : await getRoListings(query, access);
    const shouldDeferTotal = mode === "instant" || mode === "background";

    // Avoid serving a transiently cached empty homepage feed after PostgREST hiccups.
    if (useCache && result.items.length === 0) {
      const liveResult = await getRoListings(query, access);
      if (liveResult.items.length > 0) {
        result = liveResult;
      }
    }

    let total: number | undefined;
    let totalKind: RoListingsTotalKind | undefined;
    if (!shouldDeferTotal) {
      if (typeof result.totalMatched === "number") {
        total = result.totalMatched;
        totalKind = "exact";
      } else {
        try {
          const meta = await countProductsWithEstimateMeta(query, access);
          total = meta.total;
          totalKind = meta.totalKind;
        } catch {
          total = undefined;
          totalKind = undefined;
        }
      }
    }

    const payload = {
      success: true,
      items: result.items,
      nextFrom: result.nextFrom,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore,
      query: {
        from: query.from ?? 0,
        limit: query.limit ?? RO_LISTINGS_PAGE_SIZE_DESKTOP,
        page: query.page ?? 1,
      },
      ...(result.meta ? { meta: result.meta } : {}),
      ...(typeof total === "number" ? { total, total_kind: totalKind } : {}),
      fresh,
      ...(mode ? { mode } : {}),
    };

    if (redis && redisKey) {
      try {
        await redis.set(redisKey, JSON.stringify(payload), { ex: RO_LISTINGS_KV_TTL_SEC });
      } catch {
        // ignore
      }
    }

    const response = NextResponse.json(payload);

    response.headers.set(
      "Cache-Control",
      fresh || isAuthenticated
        ? "private, no-store, no-cache, must-revalidate"
        : hasLocationFilter
          ? "public, s-maxage=10, stale-while-revalidate=60"
          : "public, s-maxage=30, stale-while-revalidate=300",
    );
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
