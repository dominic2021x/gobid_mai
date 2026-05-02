/**
 * Position propensity p_view for IPS debiasing. Load from DB (cached); fallback hardcoded curve.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_POS = 30;
const CACHE_TTL_MS = 60_000;
let cache: Map<number, number> | null = null;
let cacheExpiry = 0;

/** Hardcoded default: decreasing from 0.95 (pos 1) to 0.08 (pos 30) */
function defaultPropensity(pos: number): number {
  if (pos < 1 || pos > MAX_POS) return 0.1;
  const t = (pos - 1) / (MAX_POS - 1);
  return 0.95 * Math.pow(0.08 / 0.95, t);
}

export async function getPropensity(
  supabase: SupabaseClient,
  pos: number
): Promise<number> {
  if (pos < 1 || pos > MAX_POS) return defaultPropensity(pos);
  const now = Date.now();
  if (cache && now < cacheExpiry) {
    const p = cache.get(pos);
    if (p != null) return p;
    return defaultPropensity(pos);
  }
  try {
    const { data: rows } = await supabase
      .from("search_intel_position_propensity")
      .select("pos, p_view");
    const next = new Map<number, number>();
    for (const r of rows ?? []) {
      const row = r as { pos: number; p_view: number };
      next.set(row.pos, Number(row.p_view) || defaultPropensity(row.pos));
    }
    cache = next;
    cacheExpiry = now + CACHE_TTL_MS;
    const p = cache.get(pos);
    if (p != null) return p;
  } catch {
    cache = null;
  }
  return defaultPropensity(pos);
}

/** Sync fallback when DB not available (e.g. in job with preloaded map) */
export function getPropensityDefault(pos: number): number {
  return defaultPropensity(pos);
}
