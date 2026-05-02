/**
 * Aggregate search_suggestion_events into daily_stats and recompute quality_score/rank_score.
 * Idempotent; safe to call from cron or admin recompute endpoint.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

const DAYS_TO_AGGREGATE = 2;
const ROLLING_DAYS_FOR_CTR = 30;
const SMOOTH_CLICKS = 1;
const SMOOTH_IMPRESSIONS = 20;
const UPDATE_BATCH = 500;

type EventRow = {
  suggestion_id: string | null;
  channel: string | null;
  event_type: string;
  created_at: string;
};

type DailyRow = {
  suggestion_id: string;
  day: string;
  impressions: number;
  clicks: number;
  submits: number;
};

type SuggestionAgg = {
  id: string;
  frequency_count: number;
  last_seen_at: string | null;
  source_priority: number;
};

export type AggregateSuggestionStatsResult = {
  aggregated_days: number;
  updated_suggestions: number;
  error?: string;
};

export async function runAggregateSuggestionStats(
  supabase: ReturnType<typeof createAdminClient>
): Promise<AggregateSuggestionStatsResult> {
  const result: AggregateSuggestionStatsResult = {
    aggregated_days: 0,
    updated_suggestions: 0,
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let d = 0; d < DAYS_TO_AGGREGATE; d++) {
    const dte = new Date(today);
    dte.setUTCDate(dte.getUTCDate() - d);
    const dayStr = dte.toISOString().slice(0, 10);
    const dayStart = `${dayStr}T00:00:00.000Z`;
    const dayEnd = `${dayStr}T23:59:59.999Z`;

    const { data: events, error: evError } = await supabase
      .from("search_suggestion_events")
      .select("suggestion_id, channel, event_type")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .not("suggestion_id", "is", null);

    if (evError) {
      console.warn("[aggregateSuggestionStats] events fetch:", evError.message);
      continue;
    }

    const rows = (events ?? []) as EventRow[];
    const byKey = new Map<
      string,
      { impressions: number; clicks: number; submits: number }
    >();
    for (const r of rows) {
      const sid = r.suggestion_id!;
      const ch = (r.channel ?? "").trim();
      const key = `${sid}|${dayStr}|${ch}`;
      let agg = byKey.get(key);
      if (!agg) {
        agg = { impressions: 0, clicks: 0, submits: 0 };
        byKey.set(key, agg);
      }
      if (r.event_type === "impression") agg.impressions += 1;
      else if (r.event_type === "click") agg.clicks += 1;
      else if (r.event_type === "submit") agg.submits += 1;
    }

    if (byKey.size === 0) continue;

    const batch = [...byKey.entries()].map(([key, agg]) => {
      const [suggestionId, day, channel] = key.split("|");
      return {
        suggestion_id: suggestionId,
        day,
        channel: channel || "",
        category_key: "",
        impressions: agg.impressions,
        clicks: agg.clicks,
        submits: agg.submits,
      };
    });

    const { error: rpcErr } = await supabase.rpc(
      "upsert_suggestion_daily_stats_batch",
      { _rows: batch }
    );
    if (rpcErr) {
      console.warn("[aggregateSuggestionStats] upsert batch:", rpcErr.message);
      continue;
    }
    result.aggregated_days += 1;
  }

  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - ROLLING_DAYS_FOR_CTR);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: dailyRows } = await supabase
    .from("search_suggestion_daily_stats")
    .select("suggestion_id, day, impressions, clicks, submits")
    .gte("day", cutoffStr);

  const suggTotals = new Map<
    string,
    { impressions: number; clicks: number; submits: number }
  >();
  for (const r of (dailyRows ?? []) as DailyRow[]) {
    const id = r.suggestion_id;
    let t = suggTotals.get(id);
    if (!t) {
      t = { impressions: 0, clicks: 0, submits: 0 };
      suggTotals.set(id, t);
    }
    t.impressions += r.impressions ?? 0;
    t.clicks += (r.clicks ?? 0) + (r.submits ?? 0);
  }

  const suggestionIds = [...suggTotals.keys()];
  let updated = 0;
  for (let i = 0; i < suggestionIds.length; i += UPDATE_BATCH) {
    const batchIds = suggestionIds.slice(i, i + UPDATE_BATCH);
    const { data: suggs } = await supabase
      .from("search_suggestions")
      .select("id, frequency_count, last_seen_at, source_priority")
      .in("id", batchIds);
    const arr = (suggs ?? []) as SuggestionAgg[];
    for (const s of arr) {
      const t = suggTotals.get(s.id);
      if (!t) continue;
      const ctr =
        (t.clicks + SMOOTH_CLICKS) / (t.impressions + SMOOTH_IMPRESSIONS);
      const quality_score = Math.min(1, Math.round(ctr * 10000) / 10000);
      const recency = s.last_seen_at
        ? Math.exp(
            (-(Date.now() - new Date(s.last_seen_at).getTime()) /
              (24 * 60 * 60 * 1000)) *
              Math.LN2 /
              90
          )
        : 0.2;
      const rank_score =
        quality_score * 2 +
        Math.log1p(Math.min(100, s.frequency_count)) * 0.3 +
        recency * 0.5 +
        Math.min(10, s.source_priority) * 0.1;
      const { error: upErr } = await supabase
        .from("search_suggestions")
        .update({
          quality_score: Math.round(quality_score * 10000) / 10000,
          rank_score: Math.round(rank_score * 10000) / 10000,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (!upErr) updated += 1;
    }
  }
  result.updated_suggestions = updated;
  return result;
}
