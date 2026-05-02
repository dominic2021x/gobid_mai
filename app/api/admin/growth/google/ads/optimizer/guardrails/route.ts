import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  getGrowthSetting,
  getGrowthSettingNumber,
  getGrowthSettingBoolean,
} from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET - return current guardrail settings for the optimizer UI.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const [
    ads_max_budget_change_pct,
    ads_max_actions_per_day,
    ads_allow_pause,
    ads_allow_negatives,
    ads_min_days_between_changes,
    ads_min_conversions_for_budget_increase,
    ads_cap_spend_per_day_micros,
    ads_auto_apply_mode,
    ads_min_readiness_for_full_plan,
    ads_max_target_cpa_change_pct,
    ads_allow_pause_low_qs_keyword,
    ads_max_bid_modifier_change_pct,
    ads_hourly_cost_threshold_micros,
    ads_network_cost_threshold_micros,
    ads_allow_disable_search_partners,
    ads_allow_pause_keyword,
    traffic_quality_click_session_ratio_threshold,
    traffic_quality_min_sessions,
    ads_primary_objective,
    ads_search_term_overlap_threshold,
    ads_click_quality_index_threshold,
  ] = await Promise.all([
    getGrowthSettingNumber("ads_max_budget_change_pct", 20),
    getGrowthSettingNumber("ads_max_actions_per_day", 25),
    getGrowthSettingBoolean("ads_allow_pause", false),
    getGrowthSettingBoolean("ads_allow_negatives", true),
    getGrowthSettingNumber("ads_min_days_between_changes", 3),
    getGrowthSettingNumber("ads_min_conversions_for_budget_increase", 5),
    getGrowthSettingNumber("ads_cap_spend_per_day_micros", 0),
    getGrowthSetting("ads_auto_apply_mode").then((v) => v ?? "off"),
    getGrowthSettingNumber("ads_min_readiness_for_full_plan", 0.3),
    getGrowthSettingNumber("ads_max_target_cpa_change_pct", 15),
    getGrowthSettingBoolean("ads_allow_pause_low_qs_keyword", false),
    getGrowthSettingNumber("ads_max_bid_modifier_change_pct", 20),
    getGrowthSettingNumber("ads_hourly_cost_threshold_micros", 1000000),
    getGrowthSettingNumber("ads_network_cost_threshold_micros", 500000),
    getGrowthSettingBoolean("ads_allow_disable_search_partners", false),
    getGrowthSettingBoolean("ads_allow_pause_keyword", false),
    getGrowthSettingNumber("traffic_quality_click_session_ratio_threshold", 1.7),
    getGrowthSettingNumber("traffic_quality_min_sessions", 20),
    getGrowthSetting("ads_primary_objective").then((v) => v ?? "CPA_MIN"),
    getGrowthSettingNumber("ads_search_term_overlap_threshold", 3),
    getGrowthSettingNumber("ads_click_quality_index_threshold", 0.5),
  ]);

  const autoApplyMode = ["negatives_only", "budget_decrease_only", "low_risk", "full"].includes(String(ads_auto_apply_mode))
    ? ads_auto_apply_mode
    : ads_auto_apply_mode === "all"
      ? "full"
      : "off";

  return NextResponse.json({
    ads_max_budget_change_pct,
    ads_max_actions_per_day,
    ads_allow_pause,
    ads_allow_negatives,
    ads_min_days_between_changes,
    ads_min_conversions_for_budget_increase,
    ads_cap_spend_per_day_micros,
    ads_auto_apply_mode: autoApplyMode,
    ads_min_readiness_for_full_plan,
    ads_max_target_cpa_change_pct,
    ads_allow_pause_low_qs_keyword,
    ads_max_bid_modifier_change_pct,
    ads_hourly_cost_threshold_micros,
    ads_network_cost_threshold_micros,
    ads_allow_disable_search_partners,
    ads_allow_pause_keyword,
    traffic_quality_click_session_ratio_threshold,
    traffic_quality_min_sessions,
    ads_primary_objective,
    ads_search_term_overlap_threshold,
    ads_click_quality_index_threshold,
  });
}
