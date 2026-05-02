import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get a growth_settings value by key. Returns null if not set or invalid.
 */
export async function getGrowthSetting(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;
  const v = data.value;
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

export const GROWTH_SETTING_KEYS = {
  gsc_site_url: "gsc_site_url",
  google_ads_customer_id: "google_ads_customer_id",
  ga4_property_id: "ga4_property_id",
  gtm_container_id: "gtm_container_id",
  ads_max_budget_change_pct: "ads_max_budget_change_pct",
  ads_max_actions_per_day: "ads_max_actions_per_day",
  ads_allow_pause: "ads_allow_pause",
  ads_allow_negatives: "ads_allow_negatives",
  ads_min_days_between_changes: "ads_min_days_between_changes",
  ads_min_conversions_for_budget_increase: "ads_min_conversions_for_budget_increase",
  ads_cap_spend_per_day_micros: "ads_cap_spend_per_day_micros",
  ads_auto_apply_mode: "ads_auto_apply_mode",
  ads_min_readiness_for_full_plan: "ads_min_readiness_for_full_plan",
  ads_max_target_cpa_change_pct: "ads_max_target_cpa_change_pct",
  ads_allow_pause_low_qs_keyword: "ads_allow_pause_low_qs_keyword",
  ads_max_bid_modifier_change_pct: "ads_max_bid_modifier_change_pct",
  ads_hourly_cost_threshold_micros: "ads_hourly_cost_threshold_micros",
  ads_network_cost_threshold_micros: "ads_network_cost_threshold_micros",
  ads_allow_disable_search_partners: "ads_allow_disable_search_partners",
  ads_allow_pause_keyword: "ads_allow_pause_keyword",
  traffic_quality_click_session_ratio_threshold: "traffic_quality_click_session_ratio_threshold",
  traffic_quality_min_sessions: "traffic_quality_min_sessions",
  ads_primary_objective: "ads_primary_objective",
  ads_search_term_overlap_threshold: "ads_search_term_overlap_threshold",
  ads_click_quality_index_threshold: "ads_click_quality_index_threshold",
  avg_revenue_per_listing: "avg_revenue_per_listing",
  target_margin: "target_margin",
  funnel_drop_threshold_pct: "funnel_drop_threshold_pct",
  keyword_mining_clicks_threshold: "keyword_mining_clicks_threshold",
  avg_revenue_per_user: "avg_revenue_per_user",
  repeat_purchase_rate: "repeat_purchase_rate",
  ads_scaling_risk_mode: "ads_scaling_risk_mode",
  ads_min_days_between_budget_changes: "ads_min_days_between_budget_changes",
  ads_min_days_between_bid_changes: "ads_min_days_between_bid_changes",
  ads_optimizer_enabled: "ads_optimizer_enabled",
  ads_optimizer_auto_apply_enabled: "ads_optimizer_auto_apply_enabled",
  ads_optimizer_kill_campaign_ids: "ads_optimizer_kill_campaign_ids",
  ads_optimizer_daily_hour: "ads_optimizer_daily_hour",
  ads_optimizer_last_daily_key: "ads_optimizer_last_daily_key",
  ads_optimizer_pilot_campaign_ids: "ads_optimizer_pilot_campaign_ids",
  growth_os_enabled: "growth_os_enabled",
  pseo_enabled: "pseo_enabled",
  pseo_min_impressions_28d: "pseo_min_impressions_28d",
  pseo_min_clicks_28d: "pseo_min_clicks_28d",
  pseo_min_ctr: "pseo_min_ctr",
  pseo_max_indexable_pages: "pseo_max_indexable_pages",
  flywheel_ctr_test_days: "flywheel_ctr_test_days",
  flywheel_ctr_threshold: "flywheel_ctr_threshold",
  flywheel_min_impressions_ctr: "flywheel_min_impressions_ctr",
  flywheel_prune_days: "flywheel_prune_days",
  flywheel_max_demotion_strikes: "flywheel_max_demotion_strikes",
  trends_spike_multiplier: "trends_spike_multiplier",
  trends_min_baseline: "trends_min_baseline",
  trends_max_items: "trends_max_items",
  trends_apply_create_lp_limit: "trends_apply_create_lp_limit",
  trends_apply_seed_links_limit: "trends_apply_seed_links_limit",
  growth_job_type_limits: "growth_job_type_limits",
} as const;

/**
 * Get numeric setting. Returns default if missing or invalid.
 */
export async function getGrowthSettingNumber(
  key: string,
  defaultVal: number
): Promise<number> {
  const raw = await getGrowthSetting(key);
  if (raw == null || raw === "") return defaultVal;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultVal;
}

/**
 * Get boolean setting. "true"/"1" => true; else false.
 */
export async function getGrowthSettingBoolean(
  key: string,
  defaultVal: boolean
): Promise<boolean> {
  const raw = await getGrowthSetting(key);
  if (raw == null || raw === "") return defaultVal;
  const s = String(raw).toLowerCase().trim();
  return s === "true" || s === "1";
}

/**
 * Get growth_settings value as raw (for jsonb array/object). Returns null if missing.
 */
export async function getGrowthSettingRaw(key: string): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value;
}

/**
 * Get string array setting (e.g. ads_optimizer_kill_campaign_ids). Returns default if missing or invalid.
 */
export async function getGrowthSettingStringArray(
  key: string,
  defaultVal: string[] = []
): Promise<string[]> {
  const raw = await getGrowthSettingRaw(key);
  if (Array.isArray(raw)) {
    return raw.map((x) => (x != null ? String(x) : "")).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return defaultVal;
}
