import "server-only";
import type { OptimizerAction } from "./planSchema";
import type { FunnelMetrics } from "./planSchema";
import { computeIntentScore } from "./cpcEfficiency";

const FUNNEL_DROP_THRESHOLD_PCT = 40;
const MICRO_CONVERSION_FINAL_THRESHOLD = 30;
const KEYWORD_MINING_CLICKS_THRESHOLD = 20;
const HIGH_INTENT_CONV_RATE_MIN = 0.05;

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

/**
 * Funnel leak detection: session → signup → publish_listing → paid_boost.
 * If any stage conversion rate drops below (100 - threshold)%, add SUGGEST_FUNNEL_FIX.
 */
export function computeFunnelLeakActions(
  eventCounts: Map<string, number>,
  options: { dropThresholdPct: number }
): { actions: OptimizerAction[]; funnelMetrics: FunnelMetrics } {
  const actions: OptimizerAction[] = [];
  const sessions = eventCounts.get("session_start") ?? eventCounts.get("session") ?? 0;
  const signups = eventCounts.get("signup") ?? 0;
  const publishListing = eventCounts.get("publish_listing") ?? 0;
  const paidBoost = eventCounts.get("paid_boost") ?? 0;

  const sessionToSignupPct = sessions > 0 ? (signups / sessions) * 100 : 0;
  const signupToPublishPct = signups > 0 ? (publishListing / signups) * 100 : 0;
  const publishToPaidPct = publishListing > 0 ? (paidBoost / publishListing) * 100 : 0;

  const funnelMetrics: FunnelMetrics = {
    sessions,
    signups,
    publishListing,
    paidBoost: paidBoost || undefined,
    sessionToSignupPct,
    signupToPublishPct,
    publishToPaidPct,
  };

  const threshold = options.dropThresholdPct;
  if (sessions > 0 && sessionToSignupPct < 100 - threshold) {
    actions.push({
      type: "SUGGEST_FUNNEL_FIX",
      stage: "session_to_signup",
      dropPct: Math.round(100 - sessionToSignupPct),
      reason: `Session-to-signup rate low (${sessionToSignupPct.toFixed(1)}%); consider improving signup flow or targeting.`,
      confidence: 0.8,
    });
  }
  if (signups > 0 && signupToPublishPct < 100 - threshold) {
    actions.push({
      type: "SUGGEST_FUNNEL_FIX",
      stage: "signup_to_publish",
      dropPct: Math.round(100 - signupToPublishPct),
      reason: `Signup-to-publish rate low (${signupToPublishPct.toFixed(1)}%); consider onboarding or listing flow.`,
      confidence: 0.8,
    });
  }
  if (publishListing > 0 && publishToPaidPct < 100 - threshold) {
    actions.push({
      type: "SUGGEST_FUNNEL_FIX",
      stage: "publish_to_paid",
      dropPct: Math.round(100 - publishToPaidPct),
      reason: `Publish-to-paid boost rate low (${publishToPaidPct.toFixed(1)}%); consider promotion or upsell.`,
      confidence: 0.75,
    });
  }

  return { actions, funnelMetrics };
}

/**
 * If final conversions < 30 but micro events (signup, publish_listing) exist → SUGGEST_MICRO_CONVERSION_TRACKING.
 */
export function computeMicroConversionAction(
  finalConversions: number,
  eventCounts: Map<string, number>
): OptimizerAction | null {
  if (finalConversions >= MICRO_CONVERSION_FINAL_THRESHOLD) return null;
  const signups = eventCounts.get("signup") ?? 0;
  const publishListing = eventCounts.get("publish_listing") ?? 0;
  const microTotal = signups + publishListing;
  if (microTotal === 0) return null;
  return {
    type: "SUGGEST_MICRO_CONVERSION_TRACKING",
    finalConversions,
    microEventCount: microTotal,
    reason: `Final conversions (${finalConversions}) below ${MICRO_CONVERSION_FINAL_THRESHOLD}; micro events (signup/publish) exist. Import as conversions for better bidding.`,
    confidence: 0.85,
  };
}

/**
 * High intent + high conv rate keywords → SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT.
 */
export function computeHighIntentCampaignSplitActions(
  keywordResults: unknown[]
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const rows = keywordResults as Array<Record<string, unknown>>;
  const byCampaign = new Map<string, { highIntentWithConv: number; total: number }>();

  for (const r of rows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    if (!cid) continue;
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const text = str(keyword?.text);
    if (!text) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const clicks = num(m?.clicks ?? m?.Clicks) || 1;
    const conversions = num(m?.conversions);
    const convRate = conversions / clicks;
    const intent = computeIntentScore(text);
    const existing = byCampaign.get(cid) ?? { highIntentWithConv: 0, total: 0 };
    existing.total += 1;
    if (intent === "high" && convRate >= HIGH_INTENT_CONV_RATE_MIN) existing.highIntentWithConv += 1;
    byCampaign.set(cid, existing);
  }

  for (const [campaignId, data] of byCampaign) {
    if (data.highIntentWithConv >= 3 && data.total >= 5) {
      actions.push({
        type: "SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT",
        campaignId,
        keywordCount: data.highIntentWithConv,
        reason: "High-intent keywords with strong conversion rate; consider dedicated high-intent campaign.",
        confidence: 0.75,
      });
    }
  }
  return actions;
}

/**
 * Search terms: conversions >= 1 and clicks < threshold → SUGGEST_EXACT_MATCH_EXPANSION.
 */
export function computeKeywordMiningActions(
  searchTermsResults: unknown[],
  options: { clicksThreshold: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const rows = searchTermsResults as Array<Record<string, unknown>>;

  for (const r of rows) {
    const stv = (r.search_term_view ?? r.searchTermView) as Record<string, unknown> | undefined;
    const termText = str(stv?.search_term ?? (r as Record<string, unknown>).search_term ?? (r as Record<string, unknown>).searchTerm);
    if (!termText) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const clicks = num(m?.clicks ?? m?.Clicks);
    const conversions = num(m?.conversions);
    if (conversions < 1 || clicks >= options.clicksThreshold) continue;
    actions.push({
      type: "SUGGEST_EXACT_MATCH_EXPANSION",
      term: termText,
      conversions,
      clicks,
      reason: `Search term "${termText}" has ${conversions} conversion(s) with ${clicks} clicks; consider adding as exact match.`,
      confidence: 0.8,
    });
  }
  return actions;
}

/**
 * Profit sensitivity: maxAffordableCPA = avg_revenue_per_listing * target_margin (margin as decimal, e.g. 0.2 = 20%).
 * If campaign CPA > maxAffordableCPA → add risk flag and return campaign IDs to block budget increase.
 */
export function computeProfitSensitivity(
  campaignStats: Array<{ campaignId: string; costMicros: number; conversions: number }>,
  avgRevenuePerListing: number,
  targetMarginDecimal: number
): { maxAffordableCpaMicros: number; campaignIdsAboveProfitZone: string[]; riskFlags: string[] } {
  const riskFlags: string[] = [];
  const campaignIdsAboveProfitZone: string[] = [];
  if (avgRevenuePerListing <= 0 || targetMarginDecimal <= 0) {
    return { maxAffordableCpaMicros: 0, campaignIdsAboveProfitZone: [], riskFlags: [] };
  }
  const maxAffordableCpa = avgRevenuePerListing * targetMarginDecimal;
  const maxAffordableCpaMicros = Math.round(maxAffordableCpa * 1e6);

  for (const c of campaignStats) {
    if (c.conversions <= 0) continue;
    const campaignCpaMicros = c.costMicros / c.conversions;
    if (campaignCpaMicros > maxAffordableCpaMicros) {
      campaignIdsAboveProfitZone.push(c.campaignId);
    }
  }
  if (campaignIdsAboveProfitZone.length > 0) riskFlags.push("CPA_ABOVE_PROFIT_ZONE");
  return { maxAffordableCpaMicros, campaignIdsAboveProfitZone, riskFlags };
}
