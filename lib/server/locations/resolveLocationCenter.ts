/**
 * Server-only: resolve (lat, lng) for RO marketplace location filters.
 * Tier: constants → process LRU → Upstash KV → DB exact → RPC fuzzy.
 */

import { Redis } from "@upstash/redis";
import { supabaseAdmin } from "@/lib/supabase";

export type ResolveLocationMatchKind = "const" | "lru" | "kv" | "exact" | "fuzzy";

export type ResolvedLocationCenter = {
  lat: number;
  lng: number;
  match: ResolveLocationMatchKind;
};

const KV_PREFIX = "ro:resolveloc:fwd:v1:";
const KV_TTL_SEC = 7 * 24 * 60 * 60;

function getKv(): Redis | null {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

/** Hot localities + major cities — 0ms lookup (no DB). */
const RO_TOP_LOCALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  bucuresti: { lat: 44.4268, lng: 26.1025 },
  craiova: { lat: 44.3302, lng: 23.7949 },
  "cluj-napoca": { lat: 46.7712, lng: 23.6236 },
  timisoara: { lat: 45.7489, lng: 21.2087 },
  iasi: { lat: 47.1585, lng: 27.6014 },
  brasov: { lat: 45.6427, lng: 25.5887 },
  constanta: { lat: 44.1598, lng: 28.6348 },
  galati: { lat: 45.4353, lng: 28.008 },
  ploiesti: { lat: 44.9367, lng: 26.0129 },
  pitesti: { lat: 44.8565, lng: 24.8692 },
  segarcea: { lat: 44.0947, lng: 23.7469 },
  chiajna: { lat: 44.4514, lng: 25.9765 },
  bragadiru: { lat: 44.46, lng: 25.99 },
  voluntari: { lat: 44.4938, lng: 26.1775 },
  buftea: { lat: 44.5617, lng: 25.949 },
  otopeni: { lat: 44.55, lng: 26.0667 },
};

const LRU_MAX = 1000;
const lruCache = new Map<string, ResolvedLocationCenter>();

function touchLru(key: string, value: ResolvedLocationCenter): void {
  lruCache.delete(key);
  lruCache.set(key, value);
  while (lruCache.size > LRU_MAX) {
    const first = lruCache.keys().next().value as string | undefined;
    if (first) lruCache.delete(first);
    else break;
  }
}

export function normalizeLocation(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** „Zona Metropolitană X, Județ” → „X, Județ” pentru ro_localities / geocode. */
export function stripRoMetropolitanZonePrefix(raw: string): string {
  const t = raw.trim();
  const stripped = t.replace(/^\s*Zona\s+Metropolitan[ăa]\s+/i, "").trim();
  return stripped.length >= 2 ? stripped : t;
}

function buildResolveQuery(input: { location?: string; city?: string; county?: string }): string | null {
  const loc = input.location?.trim();
  if (loc) return stripRoMetropolitanZonePrefix(loc);
  const city = input.city?.trim();
  if (!city) return null;
  const county = input.county?.trim();
  return county ? `${city}, ${county}` : city;
}

async function resolveRomanianLocalityFromDb(
  q: string,
): Promise<{ lat: number; lng: number; match: "exact" | "fuzzy" } | null> {
  const parts = q.split(",").map((part) => part.trim()).filter(Boolean);
  const cityQuery = parts[0] || q;
  const countyQuery = parts[1] || "";
  const cityNorm = normalizeLocation(cityQuery);
  const countyNorm = normalizeLocation(countyQuery);

  if (!supabaseAdmin || cityNorm.length < 2) return null;

  const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("resolve_ro_locality_center", {
    p_city_norm: cityNorm,
    p_county_norm: countyNorm.length >= 2 ? countyNorm : null,
  });

  if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as { latitude?: unknown; longitude?: unknown; match_kind?: unknown };
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const mk = String(row.match_kind ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng) && (mk === "exact" || mk === "fuzzy")) {
      return { lat, lng, match: mk };
    }
  }

  const { data } = await supabaseAdmin
    .from("ro_localities")
    .select("latitude, longitude, county_name")
    .eq("city_norm", cityNorm)
    .limit(10);

  const rows = (data ?? []).filter((row: { county_name?: string | null }) => {
    if (!countyNorm) return true;
    return normalizeLocation(String(row.county_name ?? "")).includes(countyNorm);
  });
  const row = rows[0] ?? data?.[0];
  const lat = Number(row?.latitude);
  const lng = Number(row?.longitude);
  if (row && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, match: "exact" };
  }

  return null;
}

/**
 * Resolve center coordinates for listings geo sort (never throws).
 */
export async function resolveLocationCenter(input: {
  location?: string;
  city?: string;
  county?: string;
}): Promise<ResolvedLocationCenter | null> {
  const q = buildResolveQuery(input);
  if (!q || q.length < 2) return null;

  const cacheKey = normalizeLocation(q);
  if (cacheKey.length < 2) return null;

  const hitLru = lruCache.get(cacheKey);
  if (hitLru) {
    touchLru(cacheKey, hitLru);
    return hitLru;
  }

  const cityPart = cacheKey.split(",")[0]?.trim() ?? cacheKey;
  const constHit =
    RO_TOP_LOCALITY_COORDS[cityPart] ??
    RO_TOP_LOCALITY_COORDS[cityPart.replace(/\s+/g, "-")] ??
    RO_TOP_LOCALITY_COORDS[normalizeLocation(cityPart).replace(/\s+/g, "-")];
  if (constHit) {
    const out: ResolvedLocationCenter = { lat: constHit.lat, lng: constHit.lng, match: "const" };
    touchLru(cacheKey, out);
    return out;
  }

  const kv = getKv();
  const kvKey = `${KV_PREFIX}${cacheKey}`;
  if (kv) {
    try {
      const hit = await kv.get<ResolvedLocationCenter>(kvKey);
      if (hit && typeof hit.lat === "number" && typeof hit.lng === "number") {
        touchLru(cacheKey, hit);
        return hit;
      }
    } catch {
      // ignore
    }
  }

  try {
    const db = await resolveRomanianLocalityFromDb(q);
    if (db) {
      const out: ResolvedLocationCenter = { lat: db.lat, lng: db.lng, match: db.match };
      touchLru(cacheKey, out);
      if (kv) {
        try {
          await kv.set(kvKey, out, { ex: KV_TTL_SEC });
        } catch {
          // ignore
        }
      }
      return out;
    }
  } catch {
    // ignore
  }

  return null;
}
