import { NextRequest, NextResponse } from "next/server";
import { searchProductsFts } from "@/lib/search";
import { buildIntentExpandedQueries, parseSearchIntent } from "@/lib/search/intentParser";
import { runLegacySearch } from "@/lib/search/legacySearchApi";
import type { SearchResult } from "@/lib/search/types";
import { buildQueryPipeline } from "@/lib/search/queryPipeline";
import { detectCategoryFromTokens } from "@/lib/search/detectCategory";
import { buildCategorySuggestions } from "@/lib/search/buildSuggestions";
import { rankCities, type CityCandidate } from "@/lib/search/rankCities";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";
import { createServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 3;

const MIN_LIMIT = 10;
const MAX_LIMIT = 15;
const CITY_RANK_CACHE_TTL_MS = 60 * 60 * 1000;

const cityCatalogCache: {
  loadedAt: number;
  cities: CityCandidate[];
} = { loadedAt: 0, cities: [] };

const rankedCitiesByUserCache = new Map<string, { ts: number; cities: CityCandidate[] }>();
const FALLBACK_POPULAR_CITIES = [
  "Bucuresti",
  "Craiova",
  "Cluj-Napoca",
  "Timisoara",
  "Iasi",
  "Brasov",
  "Constanta",
];

type SuggestResponse = {
  query: string;
  city: string | null;
  suggestedQueries: string[];
  topMatchingTitles: string[];
  suggestions: Array<{ label: string; q: string; type: "query" | "title" }>;
  source: "fts" | "fallback";
  elapsedMs: number;
};

async function getUserPreferredCity(request: NextRequest): Promise<string | null> {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) return null;
    const db = await createServerClient();
    const { data } = await db
      .from("user_profiles")
      .select("city,metadata")
      .eq("user_id", user.id)
      .maybeSingle();
    const profileCity = typeof data?.city === "string" ? data.city.trim() : "";
    const metadataCity = typeof (data?.metadata as Record<string, unknown> | null)?.city === "string"
      ? String((data?.metadata as Record<string, unknown>).city).trim()
      : "";
    return profileCity || metadataCity || null;
  } catch {
    return null;
  }
}

async function getCityCatalog(): Promise<CityCandidate[]> {
  const now = Date.now();
  if (cityCatalogCache.cities.length > 0 && now - cityCatalogCache.loadedAt < CITY_RANK_CACHE_TTL_MS) {
    return cityCatalogCache.cities;
  }
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from("ro_localities")
    .select("city_name, city_norm, county_name, latitude, longitude")
    .order("city_name", { ascending: true })
    .limit(5000);
  const cities = (data ?? [])
    .map((r) => ({
      city: String(r.city_name ?? "").trim(),
      cityNorm: String(r.city_norm ?? "").trim(),
      county: r.county_name ? String(r.county_name).trim() : null,
      lat: typeof r.latitude === "number" ? r.latitude : null,
      lng: typeof r.longitude === "number" ? r.longitude : null,
    }))
    .filter((c) => c.city && c.cityNorm && !c.cityNorm.includes("zona metropolitana"));
  cityCatalogCache.loadedAt = now;
  cityCatalogCache.cities = cities;
  return cities;
}

function parseCoordsFromRequest(request: NextRequest): { lat: number; lng: number } | null {
  const qpLat = Number(request.nextUrl.searchParams.get("lat"));
  const qpLng = Number(request.nextUrl.searchParams.get("lng"));
  if (Number.isFinite(qpLat) && Number.isFinite(qpLng)) {
    return { lat: qpLat, lng: qpLng };
  }
  const hLat = Number(request.headers.get("x-vercel-ip-latitude"));
  const hLng = Number(request.headers.get("x-vercel-ip-longitude"));
  if (Number.isFinite(hLat) && Number.isFinite(hLng)) {
    return { lat: hLat, lng: hLng };
  }
  return null;
}

async function getRankedCitiesForUser(
  preferredCity: string | null,
  userCoords: { lat: number; lng: number } | null,
): Promise<CityCandidate[]> {
  const coordsKey = userCoords ? `${userCoords.lat.toFixed(2)},${userCoords.lng.toFixed(2)}` : "no-geo";
  const key = `${(preferredCity ?? "__anon__").toLowerCase()}|${coordsKey}`;
  const hit = rankedCitiesByUserCache.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < CITY_RANK_CACHE_TTL_MS) return hit.cities;

  const cities = await getCityCatalog();
  const preferredNorm = preferredCity ? preferredCity.toLowerCase() : "";
  const preferred = preferredNorm
    ? cities.find((c) => c.cityNorm === preferredNorm || c.city.toLowerCase() === preferredNorm) ?? null
    : null;
  const ranked = rankCities({
    cities,
    userPreferredCity: preferredCity,
    userCoords:
      userCoords ??
      (preferred && preferred.lat != null && preferred.lng != null
        ? { lat: preferred.lat, lng: preferred.lng }
        : null),
  });
  rankedCitiesByUserCache.set(key, { ts: now, cities: ranked });
  return ranked;
}

function dedupeById(results: SearchResult[][]): SearchResult[] {
  const map = new Map<string, SearchResult>();
  for (let i = 0; i < results.length; i++) {
    for (const r of results[i]) {
      const cur = map.get(r.id);
      if (!cur || r.score > cur.score) map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function scoreByCityBoost(items: SearchResult[], city: string | null): SearchResult[] {
  if (!city) return items;
  const c = city.toLowerCase();
  return items.map((r) => {
    const rc = String(r.metadata?.city ?? "").toLowerCase();
    if (!rc || !rc.includes(c)) return r;
    return { ...r, score: (r.score ?? 0) + 0.2 };
  });
}

function buildTopTitles(items: SearchResult[], limit: number): string[] {
  return items
    .map((x) => String(x.title ?? "").trim())
    .map((t) => buildQueryPipeline(t).normalized)
    .filter((t) => t.length > 0)
    .filter((t, i, arr) => arr.findIndex((a) => a.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, limit);
}

function buildSuggestedQueries(query: string, titles: string[], city: string | null, limit: number): string[] {
  const q = buildQueryPipeline(query).normalized;
  const cityNorm = city ? buildQueryPipeline(city).normalized : null;
  const out = new Set<string>();
  if (q) out.add(q);
  if (cityNorm && q) out.add(`${q} ${cityNorm}`.trim());
  for (const title of titles) {
    const short = title.split(/[,.]/)[0]?.trim() ?? title;
    if (short.length >= 3) out.add(short);
    if (out.size >= limit * 2) break;
  }
  return [...out].slice(0, limit);
}

function toLegacySuggestions(suggestedQueries: string[], topTitles: string[]) {
  const items: Array<{ label: string; q: string; type: "query" | "title" }> = [];
  for (const q of suggestedQueries) items.push({ label: q, q, type: "query" });
  for (const t of topTitles) items.push({ label: t, q: t, type: "title" });
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = it.q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const params = request.nextUrl.searchParams;
    const qRaw = String(params.get("q") ?? "").trim();
    const qp = buildQueryPipeline(qRaw);
    const q = qp.normalized;
    const qTokens = qp.tokens;
    const limitRaw = Number(params.get("limit") ?? "10");
    const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(limitRaw) ? limitRaw : 8));
    const detectedCategory = detectCategoryFromTokens(qTokens);

    if (q.length < 2 || qTokens.length === 0) {
      const empty: SuggestResponse = {
        query: qRaw,
        city: null,
        suggestedQueries: [],
        topMatchingTitles: [],
        suggestions: [],
        source: "fts",
        elapsedMs: Date.now() - t0,
      };
      return NextResponse.json(empty);
    }

    // Structured, deterministic phase suggestions for category/location.
    if (detectedCategory) {
      const built = buildCategorySuggestions(detectedCategory, qTokens, q, limit);
      if (!built.supportsLocationPhase || !built.readyForLocationPhase) {
        const payload: SuggestResponse = {
          query: qRaw,
          city: null,
          suggestedQueries: built.baseSuggestions,
          topMatchingTitles: [],
          suggestions: toLegacySuggestions(built.baseSuggestions, []),
          source: "fts",
          elapsedMs: Date.now() - t0,
        };
        return NextResponse.json(payload, {
          headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
        });
      }

      const preferredCity = await getUserPreferredCity(request);
      const coords = parseCoordsFromRequest(request);
      let rankedCities = await getRankedCitiesForUser(preferredCity, coords);
      if (rankedCities.length === 0) {
        const intent = await parseSearchIntent(q);
        const cityFromQuery = intent.city?.trim();
        const fallbackCities = cityFromQuery
          ? [cityFromQuery, ...FALLBACK_POPULAR_CITIES.filter((c) => c.toLowerCase() !== cityFromQuery.toLowerCase())]
          : FALLBACK_POPULAR_CITIES;
        rankedCities = fallbackCities.map((city) => ({
          city,
          cityNorm: buildQueryPipeline(city).normalized,
          county: null,
          lat: null,
          lng: null,
        }));
      }

      const geoSuggestions = rankedCities
        .slice(0, limit)
        .map((c) => `${built.normalizedBaseQuery} ${c.city}`);
      // Location-first suggestions: user sees local city directly in query.
      const suggested = [...geoSuggestions, ...built.baseSuggestions].slice(0, limit);
      const payload: SuggestResponse = {
        query: qRaw,
        city: preferredCity,
        suggestedQueries: suggested,
        topMatchingTitles: [],
        suggestions: toLegacySuggestions(suggested, []),
        source: "fts",
        elapsedMs: Date.now() - t0,
      };
      return NextResponse.json(payload, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      });
    }

    const intent = await parseSearchIntent(q);
    const expanded = buildIntentExpandedQueries(intent).slice(0, 3);
    const ftsLists = await Promise.all(expanded.map((x) => searchProductsFts(x, {}, limit)));
    let merged = scoreByCityBoost(dedupeById(ftsLists), intent.city);
    merged = merged.sort((a, b) => b.score - a.score).slice(0, limit);

    let source: "fts" | "fallback" = "fts";
    if (merged.length === 0) {
      source = "fallback";
      const fallback = await runLegacySearch({ query: q, limit });
      merged = fallback.results.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        price: r.price,
        image: r.image,
        url: r.url,
        score: r.score,
        type: "product",
        metadata: { city: null, search_source: "ilike_fallback" },
      }));
    }

    const topTitles = buildTopTitles(merged, limit);
    const suggestedQueries = buildSuggestedQueries(q, topTitles, intent.city, limit);
    const payload: SuggestResponse = {
      query: qRaw,
      city: intent.city,
      suggestedQueries,
      topMatchingTitles: topTitles,
      suggestions: toLegacySuggestions(suggestedQueries, topTitles),
      source,
      elapsedMs: Date.now() - t0,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[search/suggest]", err);
    return NextResponse.json(
      {
        query: "",
        city: null,
        suggestedQueries: [],
        topMatchingTitles: [],
        suggestions: [],
        source: "fallback",
        elapsedMs: Date.now() - t0,
      } satisfies SuggestResponse,
      { status: 500 },
    );
  }
}
