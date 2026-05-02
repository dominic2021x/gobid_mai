import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { getRoListings } from "@/lib/server/products/listingsRepo";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import { normalizeRoListingsSearchParams } from "@/lib/ro/normalizedListingsQuery";
import { RO_LISTINGS_PAGE_SIZE_DESKTOP } from "@/lib/ro/roListingsPagination";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const USE_PRISMA = process.env.USE_PRISMA_LISTINGS === "true";

const getCachedListings = unstable_cache(
  async (from: number, limit: number) => getRoListings({ from, limit }),
  ["ro-listings"],
  { revalidate: 120, tags: ["ro-listings"] }
);

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
    const mode = searchParams.get("mode") === "instant"
      ? "instant"
      : searchParams.get("mode") === "background"
        ? "background"
        : null;

    if (fresh) {
      const auth = await requireAdmin(request);
      if (!auth.ok) return auth.response;
    }

    const { query, hasFilters } = normalizeRoListingsSearchParams(searchParams);
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
    let result = useCache
      ? await getCachedListings(query.from ?? 0, query.limit ?? RO_LISTINGS_PAGE_SIZE_DESKTOP)
      : await getRoListings(query, access);
    const shouldDeferExactTotal = mode === "instant" || mode === "background";
    const totalPromise = shouldDeferExactTotal
      ? Promise.resolve(undefined)
      : countProducts(query, access).catch(() => undefined);

    // Avoid serving a transiently cached empty homepage feed after PostgREST hiccups.
    if (useCache && result.items.length === 0) {
      const liveResult = await getRoListings(query, access);
      if (liveResult.items.length > 0) {
        result = liveResult;
      }
    }
    const total = shouldDeferExactTotal
      ? undefined
      : typeof result.totalMatched === "number"
        ? result.totalMatched
        : await totalPromise;

    const response = NextResponse.json({
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
      ...(typeof total === "number" ? { total } : {}),
      fresh,
      ...(mode ? { mode } : {}),
    });

    response.headers.set(
      "Cache-Control",
      fresh || isAuthenticated
        ? "private, no-store, no-cache, must-revalidate"
        : "public, s-maxage=30, stale-while-revalidate=300"
    );
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
