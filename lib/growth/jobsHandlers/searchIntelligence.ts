import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const LONG_CLICK_MS = 30000;
const ROLLUP_HOUR_MS = 60 * 60 * 1000;
const CAP_IMPRESSIONS = 10000;
const CAP_EVENTS = 20000;
const LEARN_MIN_IMPRESSIONS = 500;
const LEARN_DAYS = 7;
const LEARN_MAX_DELTA = 0.03;
const BOOST_CAP_PER_DAY = 200;
const W_MIN = 0.05;
const W_MAX = 0.7;

export async function handleSearchIntelRollupHourly(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const since = new Date(Date.now() - ROLLUP_HOUR_MS).toISOString();
    const [impRes, evtRes] = await Promise.all([
      supabase
        .from("search_impressions")
        .select("impression_id, q_norm, arm, created_at")
        .gte("created_at", since)
        .limit(CAP_IMPRESSIONS),
      supabase
        .from("search_events")
        .select("id, type, impression_id, payload")
        .in("type", ["click", "satisfaction"])
        .gte("created_at", since)
        .limit(CAP_EVENTS),
    ]);
    const impressions = (impRes.data ?? []) as Array<{ impression_id: string; q_norm: string; arm: string; created_at: string }>;
    const events = (evtRes.data ?? []) as Array<{ impression_id: string; type: string; payload: { dwellMs?: number; pogo?: boolean } }>;
    const impMap = new Map<string, { q_norm: string; arm: string; day: string }>();
    for (const i of impressions) {
      const day = i.created_at.slice(0, 10);
      impMap.set(i.impression_id, { q_norm: i.q_norm, arm: i.arm, day });
    }
    const qDayStats = new Map<string, { impressions: number; clicks: number; long_clicks: number; pogo_clicks: number; clicked_ids: Map<string, number> }>();
    const armCounts = new Map<string, { impressions: number; clicks: number; long_clicks: number }>();
    for (const imp of impressions) {
      const key = `${imp.q_norm}\t${imp.created_at.slice(0, 10)}`;
      if (!qDayStats.has(key)) qDayStats.set(key, { impressions: 0, clicks: 0, long_clicks: 0, pogo_clicks: 0, clicked_ids: new Map() });
      const s = qDayStats.get(key)!;
      s.impressions += 1;
      const armKey = imp.arm;
      if (!armCounts.has(armKey)) armCounts.set(armKey, { impressions: 0, clicks: 0, long_clicks: 0 });
      armCounts.get(armKey)!.impressions += 1;
    }
    for (const e of events) {
      const info = impMap.get(e.impression_id);
      if (!info) continue;
      const key = `${info.q_norm}\t${info.day}`;
      const s = qDayStats.get(key);
      if (s) {
        s.clicks += 1;
        const dwell = e.payload?.dwellMs ?? 0;
        if (dwell >= LONG_CLICK_MS) s.long_clicks += 1;
        if (e.payload?.pogo === true) s.pogo_clicks += 1;
        const lid = (e.payload as { listingId?: string }).listingId;
        if (lid) s.clicked_ids.set(lid, (s.clicked_ids.get(lid) ?? 0) + 1);
      }
      const ac = armCounts.get(info.arm);
      if (ac) {
        ac.clicks += 1;
        if ((e.payload?.dwellMs ?? 0) >= LONG_CLICK_MS) ac.long_clicks += 1;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [key, s] of qDayStats) {
      const [q_norm, day] = key.split("\t");
      const topIds = Array.from(s.clicked_ids.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id]) => id);
      const { data: existing } = await supabase.from("search_intel_query_stats").select("impressions, clicks, long_clicks, pogo_clicks, top_clicked_ids").eq("q_norm", q_norm).eq("day", day).maybeSingle();
      const ex = existing as { impressions: number; clicks: number; long_clicks: number; pogo_clicks: number; top_clicked_ids: string[] } | null;
      const totImps = (ex?.impressions ?? 0) + s.impressions;
      const totClicks = (ex?.clicks ?? 0) + s.clicks;
      const totLong = (ex?.long_clicks ?? 0) + s.long_clicks;
      const totPogo = (ex?.pogo_clicks ?? 0) + s.pogo_clicks;
      const mergeTop = (ex?.top_clicked_ids && Array.isArray(ex.top_clicked_ids) ? ex.top_clicked_ids : []).concat(topIds);
      const mergeCounts = new Map<string, number>();
      for (const id of mergeTop) mergeCounts.set(id, (mergeCounts.get(id) ?? 0) + 1);
      const mergedTopIds = Array.from(mergeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);
      const ctr = totImps > 0 ? totClicks / totImps : 0;
      const long_ctr = totImps > 0 ? totLong / totImps : 0;
      const pogo_rate = totClicks > 0 ? totPogo / totClicks : 0;
      await supabase.from("search_intel_query_stats").upsert(
        {
          q_norm: q_norm,
          day: day,
          impressions: totImps,
          clicks: totClicks,
          long_clicks: totLong,
          pogo_clicks: totPogo,
          ctr,
          long_ctr,
          pogo_rate,
          top_clicked_ids: mergedTopIds,
        },
        { onConflict: "q_norm,day" }
      );
    }
    for (const [arm, ac] of armCounts) {
      const { data: row } = await supabase.from("search_intel_arms").select("impressions, clicks, long_clicks").eq("arm", arm).maybeSingle();
      const r = row as { impressions: number; clicks: number; long_clicks: number } | null;
      await supabase.from("search_intel_arms").update({
        impressions: (r?.impressions ?? 0) + ac.impressions,
        clicks: (r?.clicks ?? 0) + ac.clicks,
        long_clicks: (r?.long_clicks ?? 0) + ac.long_clicks,
      }).eq("arm", arm);
    }
    await supabase.from("growth_events").insert({
      type: "search_intel_rollup_hourly",
      meta: { correlationId, qDayCount: qDayStats.size, armCount: armCounts.size },
    });
    return { ok: true, meta: { qDayCount: qDayStats.size, armCount: armCounts.size } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({ type: "search_intel_rollup_hourly_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}

export async function handleSearchIntelLearnWeightsDaily(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const since = new Date(Date.now() - LEARN_DAYS * 86400 * 1000).toISOString().slice(0, 10);
    const { data: buckets } = await supabase.from("search_intel_bucket_weights").select("bucket");
    const bucketList = (buckets ?? []).map((r: { bucket: string }) => r.bucket);
    if (bucketList.length === 0) return { ok: true, meta: {} };
    const { data: arms } = await supabase
      .from("search_intel_arms")
      .select("arm, bucket, impressions, ips_click_reward, ips_long_reward, ips_pogo_penalty");
    const armImps = new Map<string, number>();
    const bucketIps = new Map<string, { longReward: number; pogoPenalty: number }>();
    for (const a of arms ?? []) {
      const row = a as { arm: string; bucket: string; impressions: number; ips_long_reward?: number; ips_pogo_penalty?: number };
      const key = row.bucket;
      armImps.set(key, (armImps.get(key) ?? 0) + (row.impressions ?? 0));
      const cur = bucketIps.get(key) ?? { longReward: 0, pogoPenalty: 0 };
      cur.longReward += Number(row.ips_long_reward) ?? 0;
      cur.pogoPenalty += Number(row.ips_pogo_penalty) ?? 0;
      bucketIps.set(key, cur);
    }
    const meta: Record<string, unknown> = {};
    for (const bucket of bucketList) {
      const totalImps = armImps.get(bucket) ?? 0;
      if (totalImps < LEARN_MIN_IMPRESSIONS) continue;
      const { data: row } = await supabase.from("search_intel_bucket_weights").select("w_lex, w_sem, w_graph, w_fresh").eq("bucket", bucket).single();
      const r = row as { w_lex: number; w_sem: number; w_graph: number; w_fresh: number } | null;
      if (!r) continue;
      let w_lex = Number(r.w_lex) || 0.45;
      let w_sem = Number(r.w_sem) || 0.35;
      let w_graph = Number(r.w_graph) || 0.15;
      let w_fresh = Number(r.w_fresh) || 0.05;
      const delta = Math.min(LEARN_MAX_DELTA, 0.01 * Math.sqrt(totalImps / LEARN_MIN_IMPRESSIONS));
      const ips = bucketIps.get(bucket);
      const ipsNudge = ips && totalImps >= LEARN_MIN_IMPRESSIONS
        ? clamp(-LEARN_MAX_DELTA, LEARN_MAX_DELTA, (ips.longReward - ips.pogoPenalty) / Math.max(totalImps, 1) * 0.5)
        : 0;
      w_lex = clamp(W_MIN, W_MAX, w_lex + (Math.random() - 0.5) * 2 * delta);
      w_sem = clamp(W_MIN, W_MAX, w_sem + (Math.random() - 0.5) * 2 * delta);
      w_graph = clamp(W_MIN, W_MAX, w_graph + (Math.random() - 0.5) * 2 * delta);
      w_fresh = clamp(W_MIN, W_MAX, w_fresh + (Math.random() - 0.5) * 2 * delta + ipsNudge);
      const sum = w_lex + w_sem + w_graph + w_fresh;
      w_lex /= sum;
      w_sem /= sum;
      w_graph /= sum;
      w_fresh /= sum;
      await supabase.from("search_intel_bucket_weights").upsert(
        { bucket, w_lex, w_sem, w_graph, w_fresh, meta: { sampleSize: totalImps, learnedAt: new Date().toISOString(), ipsUsed: !!ips } },
        { onConflict: "bucket" }
      );
      meta[bucket] = { sampleSize: totalImps };
    }
    await supabase.from("growth_events").insert({ type: "search_intel_learn_weights_daily", meta: { correlationId, ...meta } });
    return { ok: true, meta };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({ type: "search_intel_learn_weights_daily_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}

function clamp(lo: number, hi: number, v: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export async function handleSearchIntelUpdateQueryBoostsDaily(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const { data: stats } = await supabase
      .from("search_intel_query_stats")
      .select("q_norm, impressions, top_clicked_ids")
      .gte("day", since)
      .limit(5000);
    const rows = (stats ?? []) as Array<{ q_norm: string; impressions: number; top_clicked_ids: string[] }>;
    const byQ = new Map<string, { impressions: number; top_clicked_ids: string[] }>();
    for (const row of rows) {
      const cur = byQ.get(row.q_norm) ?? { impressions: 0, top_clicked_ids: [] };
      cur.impressions += Number(row.impressions) || 0;
      if (Array.isArray(row.top_clicked_ids) && row.top_clicked_ids.length > 0) {
        cur.top_clicked_ids = row.top_clicked_ids;
      }
      byQ.set(row.q_norm, cur);
    }
    const sorted = Array.from(byQ.entries())
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, BOOST_CAP_PER_DAY);
    let updated = 0;
    for (const [q_norm, val] of sorted) {
      const topIds = val.top_clicked_ids ?? [];
      const boost: { multiplier?: number; category?: Record<string, number>; county?: Record<string, number> } = { multiplier: 1 };
      const evidence = { top_clicked_ids: topIds.slice(0, 10), impressions: val.impressions };
      await supabase.from("search_intel_query_boosts").upsert(
        { q_norm, boost, updated_at: new Date().toISOString(), evidence },
        { onConflict: "q_norm" }
      );
      updated += 1;
    }
    await supabase.from("growth_events").insert({ type: "search_intel_update_query_boosts_daily", meta: { correlationId, updated } });
    return { ok: true, meta: { updated } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({ type: "search_intel_update_query_boosts_daily_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}
