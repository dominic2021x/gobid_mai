/**
 * In-memory cache with TTL for pattern engine (taxonomy, rules, blacklist, whitelist).
 * Serverless-safe: each instance may have its own cache; cold start = empty cache.
 * Short TTL to keep data fresh without hammering DB.
 */

const TTL_MS = 60 * 1000; // 60 seconds

type CacheEntry<T> = { value: T; expiresAt: number };

const taxonomyCache = new Map<string, CacheEntry<unknown>>();
const rulesCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(cache: Map<string, CacheEntry<unknown>>, key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<unknown>>, key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export const CACHE_TTL_MS = TTL_MS;
export const CACHE_KEYS = {
  TAXONOMY: "taxonomy",
  RULES: "rules",
  BLACKLIST: "blacklist",
  WHITELIST: "whitelist",
} as const;

export function getCachedValue<T>(cache: "taxonomy" | "rules", key: string): T | null {
  const map = cache === "taxonomy" ? taxonomyCache : rulesCache;
  return getCached<T>(map, key);
}

export function setCachedValue<T>(cache: "taxonomy" | "rules", key: string, value: T): void {
  const map = cache === "taxonomy" ? taxonomyCache : rulesCache;
  setCached(map, key, value);
}
