/**
 * Fetch aggregated impressions/clicks for suggestion IDs from search_suggestion_daily_stats.
 * Used by suggest route to apply behavior-based suppression in ranking.
 * Bounded: only UUIDs, last 30 days, max 100 IDs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const DAYS = 30;

export type SuggestionStats = { impressions: number; clicks: number };

export async function fetchSuggestionStatsMap(
  supabase: SupabaseClient,
  suggestionIds: string[]
): Promise<Map<string, SuggestionStats>> {
  const uuids = suggestionIds
    .filter((id) => typeof id === "string" && UUID_REGEX.test(id))
    .slice(0, MAX_IDS);
  if (uuids.length === 0) return new Map();

  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("search_suggestion_daily_stats")
    .select("suggestion_id, impressions, clicks")
    .in("suggestion_id", uuids)
    .gte("day", sinceStr);

  if (error) return new Map();

  const rows = (data ?? []) as Array<{
    suggestion_id: string;
    impressions: number;
    clicks: number;
  }>;
  const map = new Map<string, SuggestionStats>();
  for (const r of rows) {
    const id = r.suggestion_id;
    const existing = map.get(id) ?? { impressions: 0, clicks: 0 };
    existing.impressions += Number(r.impressions) || 0;
    existing.clicks += Number(r.clicks) || 0;
    map.set(id, existing);
  }
  return map;
}
