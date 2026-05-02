/**
 * Fetch per-query per-suggestion stats from search_query_suggestion_stats for affinity scoring.
 * Used to rank suggestions that perform well for this specific query prefix.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DAYS = 30;
const MAX_SUGGESTION_IDS = 100;

export type QuerySuggestionStats = { impressions: number; clicks: number };

/**
 * For a given query_norm, fetch aggregated impressions/clicks per suggestion_id (last N days).
 * Returns map of suggestion_id -> { impressions, clicks } for affinity boost in rerank.
 */
export async function fetchQuerySuggestionStats(
  supabase: SupabaseClient,
  queryNorm: string,
  suggestionIds: string[]
): Promise<Map<string, QuerySuggestionStats>> {
  if (!queryNorm?.trim() || suggestionIds.length === 0) return new Map();

  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  const sinceStr = since.toISOString().slice(0, 10);
  const ids = suggestionIds.slice(0, MAX_SUGGESTION_IDS);

  const { data, error } = await supabase
    .from("search_query_suggestion_stats")
    .select("suggestion_id, impressions, clicks")
    .eq("query_norm", queryNorm.trim().toLowerCase())
    .gte("day", sinceStr)
    .in("suggestion_id", ids);

  if (error) return new Map();

  const rows = (data ?? []) as Array<{ suggestion_id: string; impressions: number; clicks: number }>;
  const map = new Map<string, QuerySuggestionStats>();
  for (const r of rows) {
    const id = r.suggestion_id;
    const cur = map.get(id) ?? { impressions: 0, clicks: 0 };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    map.set(id, cur);
  }
  return map;
}
