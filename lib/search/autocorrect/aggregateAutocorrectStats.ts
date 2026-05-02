/**
 * Aggregate search_autocorrect_events into search_autocorrect_daily_stats.
 * Idempotent; safe for cron. Bounded for Vercel serverless.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DAYS_TO_AGGREGATE = 2;
const BATCH_LIMIT = 500;
const EVENTS_PER_DAY_LIMIT = 5000;

type EventRow = {
  event_type: string;
  original_query_norm: string;
  suggested_query_norm: string | null;
  page_context: string | null;
  created_at: string;
};

export type AggregateAutocorrectStatsResult = {
  aggregated_days: number;
  rows_upserted: number;
  error?: string;
};

export async function runAggregateAutocorrectStats(
  supabase: SupabaseClient
): Promise<AggregateAutocorrectStatsResult> {
  const result: AggregateAutocorrectStatsResult = {
    aggregated_days: 0,
    rows_upserted: 0,
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
      .from("search_autocorrect_events")
      .select("event_type, original_query_norm, suggested_query_norm, page_context, created_at")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .limit(EVENTS_PER_DAY_LIMIT);

    if (evError) {
      result.error = evError.message;
      return result;
    }

    const rows = (events ?? []) as EventRow[];
  const SEP = "\u0001";
  const byKey = new Map<
    string,
    { shown: number; accepted: number; ignored: number; reformulated: number }
  >();

  for (const r of rows) {
    const orig = (r.original_query_norm ?? "").trim().slice(0, 120) || "";
    const sugg = (r.suggested_query_norm ?? "").trim().slice(0, 120) || "";
    const ctx = (r.page_context ?? "").trim().slice(0, 64) || "";
    const key = `${orig}${SEP}${sugg}${SEP}${ctx}`;
      let agg = byKey.get(key);
      if (!agg) {
        agg = { shown: 0, accepted: 0, ignored: 0, reformulated: 0 };
        byKey.set(key, agg);
      }
      switch (r.event_type) {
        case "autocorrect_shown":
          agg.shown += 1;
          break;
        case "autocorrect_accepted":
          agg.accepted += 1;
          break;
        case "autocorrect_ignored":
          agg.ignored += 1;
          break;
        case "autocorrect_reformulated":
          agg.reformulated += 1;
          break;
      }
    }

    if (byKey.size === 0) {
      result.aggregated_days += 1;
      continue;
    }

    const toUpsert = [...byKey.entries()].slice(0, BATCH_LIMIT).map(([key, agg]) => {
      const [original_query_norm, suggested_query_norm, page_context] = key.split(SEP);
      return {
        day: dayStr,
        original_query_norm: original_query_norm || "",
        suggested_query_norm: suggested_query_norm || "",
        page_context: page_context || "",
        shown_count: agg.shown,
        accepted_count: agg.accepted,
        ignored_count: agg.ignored,
        reformulated_count: agg.reformulated,
      };
    });

    const { error: upsertErr } = await supabase
      .from("search_autocorrect_daily_stats")
      .upsert(toUpsert, {
        onConflict: "day,original_query_norm,suggested_query_norm,page_context",
      });

    if (upsertErr) {
      result.error = upsertErr.message;
      return result;
    }

    result.rows_upserted += toUpsert.length;
    result.aggregated_days += 1;
  }

  return result;
}
