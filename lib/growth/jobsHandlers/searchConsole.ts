import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";
import { pullSearchConsolePerformance } from "@/lib/google/apis/searchConsole";

const SITE_URL_KEY = "gsc_site_url";

export async function handleGscPerformancePull(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const siteUrl = await getGrowthSetting(SITE_URL_KEY);
  if (!siteUrl || !siteUrl.trim()) {
    return { ok: false, error: "gsc_site_url not set in growth_settings" };
  }
  const days = (payload.days as number) === 28 ? 28 : 7;
  const { rows, startDate, endDate } = await pullSearchConsolePerformance(siteUrl.trim(), days);
  await supabase.from("growth_google_snapshots").insert({
    product: "search_console",
    kind: "performance",
    scope_ref: siteUrl.trim(),
    result: { rows, startDate, endDate, days, at: new Date().toISOString() },
  });
  return { ok: true, meta: { days, rowCount: rows.length, startDate, endDate } };
}

/**
 * Refresh Search Console performance and store as performance_overview for Marketing Brain.
 */
export async function handleGoogleSearchConsolePerformanceRefresh(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const siteUrl = await getGrowthSetting(SITE_URL_KEY);
  if (!siteUrl || !siteUrl.trim()) {
    return { ok: false, error: "gsc_site_url not set in growth_settings" };
  }
  const days = (payload.days as number) === 28 ? 28 : 7;
  try {
    const { rows, startDate, endDate } = await pullSearchConsolePerformance(siteUrl.trim(), days as 7 | 28);
    await supabase.from("growth_google_snapshots").insert({
      product: "search_console",
      kind: "performance_overview",
      scope_ref: siteUrl.trim(),
      result: { rows, startDate, endDate, days, at: new Date().toISOString() },
    });
    await supabase.from("growth_events").insert({
      type: "google_search_console_performance_refresh",
      meta: { siteUrl: siteUrl.trim(), correlationId, days, rowCount: rows.length },
    });
    return { ok: true, meta: { days, rowCount: rows.length, startDate, endDate } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "google_search_console_performance_refresh_failed",
      meta: { siteUrl: siteUrl.trim(), correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
