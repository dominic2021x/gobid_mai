import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { searchRomaniaLocalitySuggestions } from "@/lib/maps/nominatim-search-suggest";
import { checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { supabaseAdmin } from "@/lib/supabase";

type LocationSuggestion = { label: string; lat: number; lon: number };

const LOCATION_SUGGEST_CACHE_TTL_MS = 60 * 60 * 1000;
const LOCATION_SUGGEST_CACHE_MAX_ENTRIES = 300;
const locationSuggestCache = new Map<string, { suggestions: LocationSuggestion[]; ts: number }>();

/** Global cross-instance cache (Upstash KV). Falls back to LRU when env is missing. */
const KV_PREFIX = "ro:locsuggest:v1:";
const KV_TTL_SEC = 24 * 60 * 60;

function getKv(): Redis | null {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

function normalizeLocationQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Elimină „Zona Metropolitană …” din autosuggest (și după DB cleanup, Nominatim poate încă returna). */
function excludeMetropolitanZoneSuggestions(items: LocationSuggestion[]): LocationSuggestion[] {
  return items.filter((item) => {
    const n = normalizeLocationQuery(item.label);
    return !n.includes("zona metropolitana");
  });
}

function getCachedSuggestions(key: string): LocationSuggestion[] | null {
  const entry = locationSuggestCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > LOCATION_SUGGEST_CACHE_TTL_MS) {
    locationSuggestCache.delete(key);
    return null;
  }
  return entry.suggestions;
}

function setCachedSuggestions(key: string, suggestions: LocationSuggestion[]): void {
  locationSuggestCache.set(key, { suggestions, ts: Date.now() });
  if (locationSuggestCache.size <= LOCATION_SUGGEST_CACHE_MAX_ENTRIES) return;
  const oldestKey = locationSuggestCache.keys().next().value as string | undefined;
  if (oldestKey) locationSuggestCache.delete(oldestKey);
}

function withPublicCache(payload: unknown) {
  const response = NextResponse.json(payload);
  // Suggestions for the same query string are stable for hours; let the CDN do the work.
  response.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return response;
}

async function searchLocalityTable(q: string, limit: number): Promise<LocationSuggestion[]> {
  if (!supabaseAdmin) return [];
  const normalized = normalizeLocationQuery(q);
  if (normalized.length < 2) return [];
  const { data, error } = await supabaseAdmin
    .from("ro_localities")
    .select("city_name, county_name, latitude, longitude")
    .ilike("city_norm", `${normalized}%`)
    .limit(Math.min(20, Math.max(1, limit)));
  if (error || !Array.isArray(data)) return [];
  const mapped = data
    .map((row): LocationSuggestion | null => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      const city = String(row.city_name ?? "").trim();
      const county = String(row.county_name ?? "").trim();
      if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { label: [city, county].filter(Boolean).join(", "), lat, lon };
    })
    .filter((row): row is LocationSuggestion => row !== null);
  return excludeMetropolitanZoneSuggestions(mapped);
}

function mergeSuggestions(primary: LocationSuggestion[], secondary: LocationSuggestion[], limit: number): LocationSuggestion[] {
  const out: LocationSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const key = normalizeLocationQuery(item.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Autosugestie localități RO (Nominatim) — ex. „Craiova, Dolj”, „Segarcea, Dolj”.
 * GET ?q=… (min. 2 caractere)
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return withPublicCache({ ok: true, suggestions: [] as LocationSuggestion[] });
  }
  if (q.length > 120) {
    return NextResponse.json({ ok: false, error: "Text prea lung." }, { status: 400 });
  }

  const cacheKey = normalizeLocationQuery(q);
  const cached = getCachedSuggestions(cacheKey);
  if (cached) {
    return withPublicCache({ ok: true, suggestions: cached, cached: true });
  }

  const kv = getKv();
  const kvKey = kv ? `${KV_PREFIX}${cacheKey}` : null;
  if (kv && kvKey) {
    try {
      const hit = await kv.get<LocationSuggestion[]>(kvKey);
      if (Array.isArray(hit) && hit.length > 0) {
        setCachedSuggestions(cacheKey, hit);
        return withPublicCache({ ok: true, suggestions: hit, cached: true, source: "kv" });
      }
    } catch {
      // ignore KV errors
    }
  }

  const localSuggestions = await searchLocalityTable(q, 10);
  if (localSuggestions.length >= 5) {
    const suggestions = excludeMetropolitanZoneSuggestions(localSuggestions.slice(0, 10));
    setCachedSuggestions(cacheKey, suggestions);
    if (kv && kvKey) {
      try {
        await kv.set(kvKey, suggestions, { ex: KV_TTL_SEC });
      } catch {
        // ignore
      }
    }
    return withPublicCache({ ok: true, suggestions, source: "localities" });
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, { maxRequests: 45, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Prea multe cereri. Încearcă din nou în câteva secunde." }, { status: 429 });
  }

  const nominatimSuggestions = excludeMetropolitanZoneSuggestions(
    await searchRomaniaLocalitySuggestions(q, 10),
  );
  const suggestions = excludeMetropolitanZoneSuggestions(
    mergeSuggestions(localSuggestions, nominatimSuggestions, 10),
  );
  setCachedSuggestions(cacheKey, suggestions);
  if (kv && kvKey && suggestions.length > 0) {
    try {
      await kv.set(kvKey, suggestions, { ex: KV_TTL_SEC });
    } catch {
      // ignore
    }
  }
  return withPublicCache({ ok: true, suggestions, source: localSuggestions.length > 0 ? "mixed" : "nominatim" });
}
