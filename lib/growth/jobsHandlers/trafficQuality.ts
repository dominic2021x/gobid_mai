import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting, getGrowthSettingNumber } from "@/lib/growth/settings";
import { runGaql } from "@/lib/google/apis/googleAds";
import { pullGA4SessionsByDate } from "@/lib/google/apis/ga4";

const CUSTOMER_KEY = "google_ads_customer_id";

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(val: unknown): string {
  if (val == null) return "";
  return String(val);
}

/**
 * Daily job: compare Ads clicks vs GA4 sessions by day.
 * If ratio (clicks/sessions) > threshold and sessions >= min_sessions → write growth_events type traffic_quality_alert.
 */
export async function handleTrafficQualityMonitor(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return { ok: false, error: "google_ads_customer_id not set" };
  }

  const ratioThreshold = await getGrowthSettingNumber("traffic_quality_click_session_ratio_threshold", 1.7);
  const minSessions = await getGrowthSettingNumber("traffic_quality_min_sessions", 20);

  let clicksByDate: Map<string, number>;
  try {
    const { results } = await runGaql(customerId, "campaign_performance_14d");
    const rows = results as Array<Record<string, unknown>>;
    clicksByDate = new Map<string, number>();
    for (const r of rows) {
      const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
      const dateStr = str(seg?.date ?? seg?.Date);
      const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
      const clicks = num(m?.clicks ?? m?.Clicks);
      if (dateStr) clicksByDate.set(dateStr, (clicksByDate.get(dateStr) ?? 0) + clicks);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const ga4PropertyId = await getGrowthSetting("ga4_property_id");
  let sessionsByDate = new Map<string, number>();
  if (ga4PropertyId?.trim()) {
    try {
      const { byDate } = await pullGA4SessionsByDate(ga4PropertyId.trim(), 14);
      sessionsByDate = byDate;
    } catch {
      sessionsByDate = new Map();
    }
  }

  const breakdown: Array<{ date: string; clicks: number; sessions: number; ratio: number }> = [];
  let anomalyDays = 0;
  const suggestedMitigations: string[] = [];

  for (const [date, clicks] of clicksByDate) {
    const sessions = sessionsByDate.get(date) ?? 0;
    const ratio = sessions > 0 ? clicks / sessions : clicks > 0 ? Infinity : 0;
    breakdown.push({ date, clicks, sessions, ratio: Math.round(ratio * 100) / 100 });
    if (sessions >= minSessions && ratio > ratioThreshold) {
      anomalyDays++;
    }
  }

  if (anomalyDays > 0) {
    suggestedMitigations.push("Tighten match types");
    suggestedMitigations.push("Consider disabling search partners");
    suggestedMitigations.push("Review schedule reductions");
  }

  const totalClicks = Array.from(clicksByDate.values()).reduce((a, b) => a + b, 0);
  const totalSessions = Array.from(sessionsByDate.values()).reduce((a, b) => a + b, 0);
  const overallRatio = totalSessions > 0 ? totalClicks / totalSessions : 0;

  if (anomalyDays > 0 || (totalSessions >= minSessions && overallRatio > ratioThreshold)) {
    await supabase.from("growth_events").insert({
      type: "traffic_quality_alert",
      meta: {
        customerId,
        correlationId,
        at: new Date().toISOString(),
        ratioThreshold,
        minSessions,
        anomalyDays,
        totalClicks,
        totalSessions,
        overallRatio: Math.round(overallRatio * 100) / 100,
        breakdown: breakdown.slice(-14),
        suggestedMitigations,
        riskFlags: ["LOW_TRAFFIC_QUALITY"],
      },
    });
  }

  return {
    ok: true,
    meta: {
      anomalyDays,
      totalClicks,
      totalSessions,
      overallRatio: Math.round(overallRatio * 100) / 100,
      alertWritten: anomalyDays > 0 || (totalSessions >= minSessions && overallRatio > ratioThreshold),
    },
  };
}
