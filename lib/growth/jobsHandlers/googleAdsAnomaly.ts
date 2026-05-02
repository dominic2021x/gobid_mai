import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";
import { runGaql } from "@/lib/google/apis/googleAds";

const CUSTOMER_KEY = "google_ads_customer_id";
const PRODUCT = "google_ads";

function getCustomerId(): Promise<string> {
  return getGrowthSetting(CUSTOMER_KEY).then((id) => {
    if (!id?.trim()) throw new Error("google_ads_customer_id not set in growth_settings");
    return id.trim();
  });
}

function parseDate(str: unknown): number {
  if (typeof str !== "string") return 0;
  const d = new Date(str);
  return d.getTime();
}

/**
 * Compare last 7 days vs previous 7 days from campaign_performance_14d results.
 * Detect: conversions drop >40%, CPC increase >30%, conversion rate drop >30%.
 * Write growth_events type=google_ads_anomaly when anomaly detected.
 */
export async function handleGoogleAdsAnomalyCheck(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const last7Start = now - 7 * oneDay;
  const last7End = now;
  const prev7Start = now - 14 * oneDay;
  const prev7End = now - 7 * oneDay;

  let results: unknown[];
  try {
    const { results: r } = await runGaql(customerId, "campaign_performance_14d");
    results = r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const rows = results as Array<Record<string, unknown>>;
  const byCampaignByPeriod = new Map<
    string,
    { conversions: number; costMicros: number; clicks: number; impressions: number }
  >();

  for (const r of rows) {
    const camp = r.campaign as Record<string, unknown> | undefined;
    const cid = String(camp?.id ?? "");
    if (!cid) continue;
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const dateStr = seg?.date ?? (seg as Record<string, unknown>)?.Date;
    const ts = parseDate(dateStr);
    if (!ts) continue;
    const period = ts >= last7Start && ts < last7End ? "last7" : ts >= prev7Start && ts < prev7End ? "prev7" : null;
    if (!period) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const conversions = Number(m?.conversions ?? 0) || 0;
    const costMicros = Number(m?.costMicros ?? m?.cost_micros ?? 0) || 0;
    const clicks = Number(m?.clicks ?? 0) || 0;
    const impressions = Number(m?.impressions ?? 0) || 0;
    const key = `${cid}:${period}`;
    const existing = byCampaignByPeriod.get(key) ?? { conversions: 0, costMicros: 0, clicks: 0, impressions: 0 };
    byCampaignByPeriod.set(key, {
      conversions: existing.conversions + conversions,
      costMicros: existing.costMicros + costMicros,
      clicks: existing.clicks + clicks,
      impressions: existing.impressions + impressions,
    });
  }

  const campaignIds = new Set<string>();
  byCampaignByPeriod.forEach((_, k) => campaignIds.add(k.split(":")[0]));

  const anomalies: Array<{ campaignId: string; metric: string; delta: number; last7: number; prev7: number }> = [];

  for (const cid of campaignIds) {
    const last7 = byCampaignByPeriod.get(`${cid}:last7`);
    const prev7 = byCampaignByPeriod.get(`${cid}:prev7`);
    if (!last7 || !prev7) continue;

    if (prev7.conversions >= 1 && last7.conversions < prev7.conversions * 0.6) {
      anomalies.push({
        campaignId: cid,
        metric: "conversions_drop",
        delta: (last7.conversions - prev7.conversions) / prev7.conversions,
        last7: last7.conversions,
        prev7: prev7.conversions,
      });
    }

    const prevCpc = prev7.clicks > 0 ? prev7.costMicros / prev7.clicks : 0;
    const lastCpc = last7.clicks > 0 ? last7.costMicros / last7.clicks : 0;
    if (prevCpc > 0 && lastCpc > prevCpc * 1.3) {
      anomalies.push({
        campaignId: cid,
        metric: "cpc_increase",
        delta: (lastCpc - prevCpc) / prevCpc,
        last7: lastCpc,
        prev7: prevCpc,
      });
    }

    const prevConvRate = prev7.clicks > 0 ? prev7.conversions / prev7.clicks : 0;
    const lastConvRate = last7.clicks > 0 ? last7.conversions / last7.clicks : 0;
    if (prevConvRate > 0 && lastConvRate < prevConvRate * 0.7) {
      anomalies.push({
        campaignId: cid,
        metric: "conversion_rate_drop",
        delta: (lastConvRate - prevConvRate) / prevConvRate,
        last7: lastConvRate,
        prev7: prevConvRate,
      });
    }
  }

  if (anomalies.length > 0) {
    await supabase.from("growth_events").insert({
      type: "google_ads_anomaly",
      meta: { customerId, correlationId, anomalies, at: new Date().toISOString() },
    });
  }

  return { ok: true, meta: { anomaliesCount: anomalies.length, anomalies } };
}
