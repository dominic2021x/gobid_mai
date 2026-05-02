/**
 * Load pattern rules (blacklist, whitelist) from DB with short TTL cache.
 * Returns sets for fast lookup; merge with defaults in callers if needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedValue, setCachedValue, CACHE_KEYS } from "./cacheLayer";

export type CachedPatternRules = {
  blacklist: Set<string>;
  whitelist: Set<string>;
};

export async function getCachedPatternRules(
  supabase: SupabaseClient | null
): Promise<CachedPatternRules> {
  const cached = getCachedValue<CachedPatternRules>("rules", CACHE_KEYS.RULES);
  if (cached) return cached;

  const result: CachedPatternRules = {
    blacklist: new Set(),
    whitelist: new Set(),
  };

  if (!supabase) {
    setCachedValue("rules", CACHE_KEYS.RULES, result);
    return result;
  }

  try {
    const [blackRes, whiteRes] = await Promise.all([
      supabase
        .from("search_suggestions_blacklist")
        .select("phrase_norm")
        .limit(5000),
      supabase
        .from("search_pattern_whitelist")
        .select("phrase_norm")
        .limit(5000),
    ]);

    const blackRows = (blackRes.data ?? []) as Array<{ phrase_norm: string }>;
    const whiteRows = (whiteRes.data ?? []) as Array<{ phrase_norm: string }>;

    for (const r of blackRows) {
      const n = (r.phrase_norm ?? "").trim().toLowerCase();
      if (n) result.blacklist.add(n);
    }
    for (const r of whiteRows) {
      const n = (r.phrase_norm ?? "").trim().toLowerCase();
      if (n) result.whitelist.add(n);
    }

    setCachedValue("rules", CACHE_KEYS.RULES, result);
    return result;
  } catch {
    setCachedValue("rules", CACHE_KEYS.RULES, result);
    return result;
  }
}
