/**
 * Search intelligence: query boosts (clamped [0.8, 1.25]), intent bucket from intent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCandidate } from "./types";

const BOOST_MIN = 0.8;
const BOOST_MAX = 1.25;

export interface QueryBoostRow {
  boost?: {
    multiplier?: number;
    category?: Record<string, number>;
    county?: Record<string, number>;
  };
}

/**
 * Apply per-query boosts from search_intel_query_boosts. Multiplicative boost per candidate, clamped [0.8, 1.25].
 */
export async function applyQueryBoosts(
  supabase: SupabaseClient,
  qNorm: string,
  candidates: SearchCandidate[]
): Promise<SearchCandidate[]> {
  const { data } = await supabase
    .from("search_intel_query_boosts")
    .select("boost")
    .eq("q_norm", qNorm)
    .maybeSingle();
  const row = data as QueryBoostRow | null;
  const boostConfig = row?.boost;
  if (!boostConfig || typeof boostConfig !== "object") {
    return candidates.map((c) => ({ ...c, queryBoostMultiplier: 1 }));
  }
  const mult = clamp(
    Number(boostConfig.multiplier) || 1,
    BOOST_MIN,
    BOOST_MAX
  );
  const categoryMap = boostConfig.category && typeof boostConfig.category === "object" ? boostConfig.category : {};
  const countyMap = boostConfig.county && typeof boostConfig.county === "object" ? boostConfig.county : {};
  return candidates.map((c) => {
    let m = mult;
    const cat = (c.category ?? "").trim();
    const county = (c.county ?? "").trim();
    if (cat && categoryMap[cat] != null) m *= clamp(Number(categoryMap[cat]), BOOST_MIN, BOOST_MAX);
    if (county && countyMap[county] != null) m *= clamp(Number(countyMap[county]), BOOST_MIN, BOOST_MAX);
    m = clamp(m, BOOST_MIN, BOOST_MAX);
    return { ...c, queryBoostMultiplier: m };
  });
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Map intent result to intent_bucket for impressions/arms (e.g. county_fixed, category_fixed, default).
 */
export function getIntentBucket(intent: string, categorySlug?: string | null, countySlug?: string | null): string {
  if (countySlug) return "county_fixed";
  if (categorySlug) return "category_fixed";
  if (intent === "navigational") return "navigational";
  return "default";
}
