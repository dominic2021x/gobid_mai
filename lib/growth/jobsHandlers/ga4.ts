import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";
import { pullGA4Report, pullGA4FunnelEventCounts } from "@/lib/google/apis/ga4";

const PROPERTY_ID_KEY = "ga4_property_id";

export async function handleGa4FunnelRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const propertyId = await getGrowthSetting(PROPERTY_ID_KEY);
  if (!propertyId || !propertyId.trim()) {
    return { ok: false, error: "ga4_property_id not set in growth_settings" };
  }
  const pid = propertyId.trim();
  try {
    const { eventCounts } = await pullGA4FunnelEventCounts(pid, 7);
    const sessions = eventCounts.get("session_start") ?? eventCounts.get("session") ?? 0;
    const signups = eventCounts.get("signup") ?? 0;
    const publishListing = eventCounts.get("publish_listing") ?? 0;
    const paidBoost = eventCounts.get("paid_boost") ?? 0;
    const sessionToSignupPct = sessions > 0 ? (signups / sessions) * 100 : 0;
    const signupToPublishPct = signups > 0 ? (publishListing / signups) * 100 : 0;
    const publishToPaidPct = publishListing > 0 ? (paidBoost / publishListing) * 100 : 0;
    const result = {
      sessions,
      signups,
      publishListing,
      paidBoost,
      sessionToSignupPct,
      signupToPublishPct,
      publishToPaidPct,
      days: 7,
      generatedAt: new Date().toISOString(),
    };
    await supabase.from("growth_google_snapshots").insert({
      product: "ga4",
      kind: "funnel_overview",
      scope_ref: pid,
      result: result as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "ga4_funnel_refresh",
      meta: { propertyId: pid, correlationId, generatedAt: result.generatedAt },
    });
    return { ok: true, meta: { generatedAt: result.generatedAt } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "ga4_funnel_refresh_failed",
      meta: { propertyId: pid, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleGa4ReportPull(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const propertyId = await getGrowthSetting(PROPERTY_ID_KEY);
  if (!propertyId || !propertyId.trim()) {
    return { ok: false, error: "ga4_property_id not set in growth_settings" };
  }
  const days = typeof payload.days === "number" && payload.days > 0 ? Math.min(payload.days, 365) : 28;
  const { rows, rowCount } = await pullGA4Report(propertyId.trim(), days);
  await supabase.from("growth_google_snapshots").insert({
    product: "ga4",
    kind: "report",
    scope_ref: propertyId.trim(),
    result: { rows, rowCount, days, at: new Date().toISOString() },
  });
  return { ok: true, meta: { days, rowCount } };
}
