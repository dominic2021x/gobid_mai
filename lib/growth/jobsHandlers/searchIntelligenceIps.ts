import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPropensityDefault } from "@/lib/search/v2/propensity";

const LONG_CLICK_MS = 30000;
const ROLLUP_HOUR_MS = 60 * 60 * 1000;
const CAP_IMPRESSIONS = 10000;
const CAP_EVENTS = 20000;
const IPS_REWARD_CLICK = 1;
const IPS_REWARD_LONG = 2;
const IPS_PENALTY_POGO = -1;
const IPS_REWARD_CLAMP_MAX = 10;

export async function handleSearchIntelRollupHourlyIps(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const since = new Date(Date.now() - ROLLUP_HOUR_MS).toISOString();
    const [impRes, evtRes] = await Promise.all([
      supabase
        .from("search_impressions")
        .select("impression_id, q_norm, arm, intent_bucket, results, created_at")
        .gte("created_at", since)
        .limit(CAP_IMPRESSIONS),
      supabase
        .from("search_events")
        .select("id, type, impression_id, payload")
        .in("type", ["click", "satisfaction"])
        .gte("created_at", since)
        .limit(CAP_EVENTS),
    ]);
    const impressions = (impRes.data ?? []) as Array<{
      impression_id: string;
      q_norm: string;
      arm: string;
      intent_bucket?: string;
      results: Array<{ id: string; pos?: number }>;
      created_at: string;
    }>;
    const events = (evtRes.data ?? []) as Array<{
      impression_id: string;
      type: string;
      payload: { listingId?: string; pos?: number; dwellMs?: number; pogo?: boolean };
    }>;

    const impMap = new Map<
      string,
      { arm: string; bucket: string; results: Array<{ id: string; pos: number }> }
    >();
    for (const i of impressions) {
      const bucket = i.intent_bucket ?? "default";
      const results = Array.isArray(i.results) ? i.results : [];
      const withPos = results.map((r, idx) => ({
        id: typeof r.id === "string" ? r.id : "",
        pos: typeof (r as { pos?: number }).pos === "number" ? (r as { pos: number }).pos : idx + 1,
      }));
      impMap.set(i.impression_id, { arm: i.arm, bucket, results: withPos });
    }

    const armIps = new Map<
      string,
      { clickReward: number; longReward: number; pogoPenalty: number; impressions: number }
    >();
    const dayBucketArm = new Map<
      string,
      { clickReward: number; longReward: number; pogoPenalty: number; impressions: number }
    >();
    const today = new Date().toISOString().slice(0, 10);

    for (const imp of impressions) {
      const key = imp.arm;
      if (!armIps.has(key)) armIps.set(key, { clickReward: 0, longReward: 0, pogoPenalty: 0, impressions: 0 });
      armIps.get(key)!.impressions += 1;
      const dkey = `${today}\t${imp.intent_bucket ?? "default"}\t${imp.arm}`;
      if (!dayBucketArm.has(dkey)) dayBucketArm.set(dkey, { clickReward: 0, longReward: 0, pogoPenalty: 0, impressions: 0 });
      dayBucketArm.get(dkey)!.impressions += 1;
    }

    for (const e of events) {
      const info = impMap.get(e.impression_id);
      if (!info) continue;
      const pos = e.payload?.pos ?? 1;
      const pView = Math.max(0.05, getPropensityDefault(pos));
      let reward = IPS_REWARD_CLICK;
      if ((e.payload?.dwellMs ?? 0) >= LONG_CLICK_MS) reward += IPS_REWARD_LONG;
      if (e.payload?.pogo === true) reward += IPS_PENALTY_POGO;
      const ipsReward = Math.min(IPS_REWARD_CLAMP_MAX, Math.max(-IPS_REWARD_CLAMP_MAX, reward / pView));

      const ac = armIps.get(info.arm);
      if (ac) {
        ac.clickReward += IPS_REWARD_CLICK / pView;
        if ((e.payload?.dwellMs ?? 0) >= LONG_CLICK_MS) ac.longReward += IPS_REWARD_LONG / pView;
        if (e.payload?.pogo === true) ac.pogoPenalty += IPS_PENALTY_POGO / pView;
      }
      const dkey = `${today}\t${info.bucket}\t${info.arm}`;
      const dc = dayBucketArm.get(dkey);
      if (dc) {
        dc.clickReward += IPS_REWARD_CLICK / pView;
        if ((e.payload?.dwellMs ?? 0) >= LONG_CLICK_MS) dc.longReward += IPS_REWARD_LONG / pView;
        if (e.payload?.pogo === true) dc.pogoPenalty += IPS_PENALTY_POGO / pView;
      }
    }

    for (const [arm, ac] of armIps) {
      const { data: row } = await supabase
        .from("search_intel_arms")
        .select("ips_click_reward, ips_long_reward, ips_pogo_penalty")
        .eq("arm", arm)
        .maybeSingle();
      const r = row as { ips_click_reward?: number; ips_long_reward?: number; ips_pogo_penalty?: number } | null;
      await supabase
        .from("search_intel_arms")
        .update({
          ips_click_reward: (Number(r?.ips_click_reward) ?? 0) + ac.clickReward,
          ips_long_reward: (Number(r?.ips_long_reward) ?? 0) + ac.longReward,
          ips_pogo_penalty: (Number(r?.ips_pogo_penalty) ?? 0) + ac.pogoPenalty,
        })
        .eq("arm", arm);
    }

    for (const [dkey, dc] of dayBucketArm) {
      const [day, bucket, arm] = dkey.split("\t");
      const { data: existing } = await supabase
        .from("search_intel_arm_stats_daily")
        .select("ips_click_reward, ips_long_reward, ips_pogo_penalty, impressions")
        .eq("day", day)
        .eq("bucket", bucket)
        .eq("arm", arm)
        .maybeSingle();
      const ex = existing as { ips_click_reward?: number; ips_long_reward?: number; ips_pogo_penalty?: number; impressions?: number } | null;
      await supabase.from("search_intel_arm_stats_daily").upsert(
        {
          day,
          bucket,
          arm,
          ips_click_reward: (Number(ex?.ips_click_reward) ?? 0) + dc.clickReward,
          ips_long_reward: (Number(ex?.ips_long_reward) ?? 0) + dc.longReward,
          ips_pogo_penalty: (Number(ex?.ips_pogo_penalty) ?? 0) + dc.pogoPenalty,
          impressions: (Number(ex?.impressions) ?? 0) + dc.impressions,
        },
        { onConflict: "day,bucket,arm" }
      );
    }

    await supabase.from("growth_events").insert({
      type: "search_intel_rollup_hourly_ips",
      meta: { correlationId, armCount: armIps.size },
    });
    return { ok: true, meta: { armCount: armIps.size } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({
      type: "search_intel_rollup_hourly_ips_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
