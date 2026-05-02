/**
 * Batch fetch query stats and user profiles for alert ranking.
 * No N+1 queries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface QueryStatsAgg {
  ctr_7d: number;
  long_click_rate: number;
  pogo_rate: number;
}

export interface UserProfileAgg {
  category?: Record<string, number>;
  county?: Record<string, number>;
  top_categories?: Array<{ slug?: string; k?: string; weight?: number; v?: number }>;
  top_counties?: Array<{ slug?: string; k?: string; weight?: number; v?: number }>;
}

export async function fetchQueryStatsMap(
  supabase: SupabaseClient,
  qNorms: string[]
): Promise<Map<string, QueryStatsAgg>> {
  const map = new Map<string, QueryStatsAgg>();
  const unique = [...new Set(qNorms)].filter(Boolean);
  if (unique.length === 0) return map;

  try {
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("search_intel_query_stats")
      .select("q_norm, impressions, clicks, long_clicks, pogo_clicks")
      .gte("day", since)
      .in("q_norm", unique);

    if (error) return map;

    const byQ = new Map<string, { imps: number; clicks: number; long: number; pogo: number }>();
    for (const r of data ?? []) {
    const row = r as { q_norm: string; impressions: number; clicks: number; long_clicks: number; pogo_clicks: number };
    const cur = byQ.get(row.q_norm) ?? { imps: 0, clicks: 0, long: 0, pogo: 0 };
    cur.imps += Number(row.impressions) ?? 0;
    cur.clicks += Number(row.clicks) ?? 0;
    cur.long += Number(row.long_clicks) ?? 0;
    cur.pogo += Number(row.pogo_clicks) ?? 0;
      byQ.set(row.q_norm, cur);
    }

    for (const [q, agg] of byQ) {
    const ctr_7d = agg.imps > 0 ? agg.clicks / agg.imps : 0;
    const long_click_rate = agg.clicks > 0 ? agg.long / agg.clicks : 0;
    const pogo_rate = agg.clicks > 0 ? agg.pogo / agg.clicks : 0;
      map.set(q, { ctr_7d, long_click_rate, pogo_rate });
    }

    return map;
  } catch {
    return map;
  }
}

export async function fetchUserProfilesMap(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserProfileAgg>> {
  const map = new Map<string, UserProfileAgg>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("user_search_profiles")
      .select("user_id, prefs")
      .in("user_id", unique);

    if (error) return map;

    for (const r of data ?? []) {
      const row = r as { user_id: string; prefs?: Record<string, unknown> };
      const p = row.prefs ?? {};
      map.set(row.user_id, {
        category: typeof p.category === "object" && p.category !== null ? (p.category as Record<string, number>) : undefined,
        county: typeof p.county === "object" && p.county !== null ? (p.county as Record<string, number>) : undefined,
        top_categories: Array.isArray(p.top_categories) ? (p.top_categories as UserProfileAgg["top_categories"]) : undefined,
        top_counties: Array.isArray(p.top_counties) ? (p.top_counties as UserProfileAgg["top_counties"]) : undefined,
      });
    }

    return map;
  } catch {
    return map;
  }
}
