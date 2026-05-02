import { supabaseAdmin } from "@/lib/supabase";
import { normalizeRo } from "./roNormalize";

export type LocalityEntry = {
  city: string;
  cityNorm: string;
  county: string | null;
  countyNorm: string | null;
};

type LocalitiesCache = {
  loadedAt: number;
  entries: LocalityEntry[];
  cityTokensIndex: Map<string, LocalityEntry[]>;
  countyTokensIndex: Map<string, LocalityEntry[]>;
};

let cache: LocalitiesCache | null = null;
let inflight: Promise<LocalitiesCache> | null = null;

const CACHE_TTL_MS = 30 * 60 * 1000;

function tokenizeNorm(value: string): string[] {
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function indexByTokens(entries: LocalityEntry[], key: "cityNorm" | "countyNorm"): Map<string, LocalityEntry[]> {
  const map = new Map<string, LocalityEntry[]>();
  for (const entry of entries) {
    const source = key === "cityNorm" ? entry.cityNorm : entry.countyNorm;
    if (!source) continue;
    for (const token of tokenizeNorm(source)) {
      const arr = map.get(token) ?? [];
      arr.push(entry);
      map.set(token, arr);
    }
  }
  return map;
}

async function fetchLocalities(): Promise<LocalityEntry[]> {
  if (!supabaseAdmin) return [];
  const pageSize = 1000;
  let from = 0;
  const out: LocalityEntry[] = [];

  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseAdmin
      .from("ro_localities")
      .select("city_name, city_norm, county_name, county_norm")
      .range(from, to)
      .order("city_name", { ascending: true });

    if (error) {
      console.error("[localitiesCache] fetch", error);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const city = String(row.city_name ?? "").trim();
      const cityNormRaw = String(row.city_norm ?? "").trim();
      if (!city || !cityNormRaw) continue;
      if (cityNormRaw.includes("zona metropolitana")) continue;
      out.push({
        city,
        cityNorm: cityNormRaw,
        county: row.county_name ? String(row.county_name).trim() : null,
        countyNorm: row.county_norm ? String(row.county_norm).trim() : null,
      });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export async function getRomanianLocalitiesCache(): Promise<LocalitiesCache> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const entries = await fetchLocalities();
    const next: LocalitiesCache = {
      loadedAt: Date.now(),
      entries,
      cityTokensIndex: indexByTokens(entries, "cityNorm"),
      countyTokensIndex: indexByTokens(entries, "countyNorm"),
    };
    cache = next;
    inflight = null;
    return next;
  })();

  return inflight;
}

export async function detectCityCountyFromQuery(
  normalizedQuery: string,
): Promise<{ city: string | null; county: string | null }> {
  if (!normalizedQuery) return { city: null, county: null };
  const norm = normalizeRo(normalizedQuery);
  if (!norm) return { city: null, county: null };

  const { entries, cityTokensIndex, countyTokensIndex } = await getRomanianLocalitiesCache();
  if (entries.length === 0) return { city: null, county: null };

  let best: { entry: LocalityEntry; score: number } | null = null;
  const tokens = tokenizeNorm(norm);
  const candidates = new Set<LocalityEntry>();

  for (const t of tokens) {
    for (const e of cityTokensIndex.get(t) ?? []) candidates.add(e);
    for (const e of countyTokensIndex.get(t) ?? []) candidates.add(e);
  }
  if (candidates.size === 0) {
    // fallback: scan prefix/substring if token index doesn't hit
    for (const e of entries) {
      if (norm.includes(e.cityNorm)) candidates.add(e);
    }
  }

  for (const entry of candidates) {
    let score = 0;
    if (norm.includes(entry.cityNorm)) score += 5 + entry.cityNorm.length / 100;
    const cityPrefix = entry.cityNorm.split(/\s+/)[0] ?? "";
    if (cityPrefix && norm.includes(cityPrefix)) score += 1;
    if (entry.countyNorm && norm.includes(entry.countyNorm)) score += 2;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { entry, score };
  }

  if (!best) return { city: null, county: null };
  return {
    city: best.entry.city,
    county: best.entry.county,
  };
}
