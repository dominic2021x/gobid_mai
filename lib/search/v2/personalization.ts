/**
 * Personal Search Agent: load profile, compute multiplier [0.95, 1.10], apply without changing recall.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCandidate } from "./types";

const MULT_MIN = 0.95;
const MULT_MAX = 1.1;
const CACHE_TTL_MS = 120_000;
const profileCache = new Map<string, { prefs: UserPrefs; at: number }>();

export interface UserPrefs {
  category?: Record<string, number>;
  county?: Record<string, number>;
  query?: Record<string, number>;
}

function clampMult(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < MULT_MIN) return MULT_MIN;
  if (v > MULT_MAX) return MULT_MAX;
  return v;
}

export async function loadUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPrefs | null> {
  const now = Date.now();
  const hit = profileCache.get(userId);
  if (hit && now < hit.at + CACHE_TTL_MS) return hit.prefs;
  const { data } = await supabase
    .from("user_search_profiles")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = (data as { prefs?: UserPrefs } | null)?.prefs ?? null;
  if (prefs && typeof prefs === "object") profileCache.set(userId, { prefs, at: now });
  return prefs;
}

export function computePersonalMultiplier(
  candidate: SearchCandidate,
  prefs: UserPrefs | null
): number {
  if (!prefs || typeof prefs !== "object") return 1;
  let mult = 1;
  const cat = (candidate.category ?? "").trim();
  const county = (candidate.county ?? "").trim();
  if (cat && prefs.category?.[cat] != null) mult *= clampMult(1 + Number(prefs.category[cat]) * 0.1);
  if (county && prefs.county?.[county] != null) mult *= clampMult(1 + Number(prefs.county[county]) * 0.1);
  return clampMult(mult);
}

/**
 * Apply personalization: multiply each candidate's score by its personal multiplier.
 * Does not change recall or diversification order.
 */
export function applyPersonalization(
  candidates: SearchCandidate[],
  prefs: UserPrefs | null
): SearchCandidate[] {
  if (!prefs) return candidates;
  return candidates.map((c) => {
    const mult = computePersonalMultiplier(c, prefs);
    const score = (c.score ?? 0) * mult;
    return { ...c, score };
  });
}
