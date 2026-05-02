import "server-only";
import type { OptimizerAction } from "./planSchema";

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

/** Normalize search term: lowercase, remove diacritics. */
function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Search terms cluster detection: same term in multiple ad groups.
 * If overlap > threshold → SUGGEST_NEGATIVE_CROSS_MATCH.
 * If many broad-overlap terms → SUGGEST_RESTRUCTURE_ADGROUP.
 */
export function computeSearchTermClusterActions(
  searchTermsStructureResults: unknown[],
  options: { overlapThreshold: number; broadOverlapCountThreshold: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const rows = searchTermsStructureResults as Array<Record<string, unknown>>;
  const termToAdGroups = new Map<string, Set<string>>();
  const termToCampaigns = new Map<string, Set<string>>();

  for (const r of rows) {
    const stv = (r.search_term_view ?? r.searchTermView) as Record<string, unknown> | undefined;
    const termRaw = str(stv?.search_term ?? stv?.searchTerm);
    const normalized = normalizeTerm(termRaw);
    if (!normalized || normalized.length < 2) continue;
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    const agid = str(adGroup?.id);
    if (!agid) continue;
    const key = normalized;
    if (!termToAdGroups.has(key)) {
      termToAdGroups.set(key, new Set());
      termToCampaigns.set(key, new Set());
    }
    termToAdGroups.get(key)!.add(agid);
    if (cid) termToCampaigns.get(key)!.add(cid);
  }

  let broadOverlapCount = 0;
  for (const [term, adGroupSet] of termToAdGroups) {
    const overlapCount = adGroupSet.size;
    if (overlapCount >= options.overlapThreshold) {
      const campaignSet = termToCampaigns.get(term) ?? new Set();
      actions.push({
        type: "SUGGEST_NEGATIVE_CROSS_MATCH",
        term,
        adGroupIds: Array.from(adGroupSet),
        campaignIds: Array.from(campaignSet),
        overlapCount,
        reason: `Term "${term}" appears in ${overlapCount} ad groups; consider adding as negative in non-primary ad groups.`,
        confidence: 0.85,
      });
      broadOverlapCount++;
    }
  }

  if (broadOverlapCount >= options.broadOverlapCountThreshold) {
    actions.push({
      type: "SUGGEST_RESTRUCTURE_ADGROUP",
      broadTermCount: broadOverlapCount,
      reason: `Many search terms (${broadOverlapCount}) overlap across ad groups; consider restructuring ad groups by theme.`,
      confidence: 0.8,
    });
  }

  return actions;
}

/**
 * Bidding strategy switch detector: if 30d conversions < 30 and strategy is TARGET_CPA or MAXIMIZE_CONVERSIONS → SUGGEST_BIDDING_STRATEGY_CHANGE.
 */
export function computeBiddingStrategySuggestions(
  campaignStats: Array<{ campaignId: string; campaignName?: string; conversions: number; biddingStrategyType?: string }>,
  options: { minConversionsForAutoBidding: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const totalConv = campaignStats.reduce((s, c) => s + c.conversions, 0);
  if (totalConv >= options.minConversionsForAutoBidding) return actions;

  const targetStrategies = ["TARGET_CPA", "MAXIMIZE_CONVERSIONS"];
  for (const c of campaignStats) {
    const strategy = str(c.biddingStrategyType).toUpperCase();
    if (targetStrategies.includes(strategy) && c.conversions < options.minConversionsForAutoBidding) {
      actions.push({
        type: "SUGGEST_BIDDING_STRATEGY_CHANGE",
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        currentStrategy: strategy,
        conversions30d: c.conversions,
        reason: `Campaign has ${c.conversions} conversions (30d); ${strategy} works better with ≥${options.minConversionsForAutoBidding} conversions. Consider manual CPC.`,
        confidence: 0.8,
      });
    }
  }
  return actions;
}

/**
 * Impression share efficiency: efficientIS = conversions / search_impression_share (avoid div by zero).
 * Returns signals: campaigns where IS high but conv rate low (reduce), IS low and conv good (allow increase).
 */
export function computeImpressionShareSignals(
  campaignStats: Array<{ campaignId: string; conversions: number; costMicros: number; clicks: number }>,
  auctionCampaignRows: Array<Record<string, unknown>>
): {
  reduceCampaignIds: Set<string>;
  allowIncreaseCampaignIds: Set<string>;
} {
  const reduceIds = new Set<string>();
  const allowIncreaseIds = new Set<string>();
  const byCampaign = new Map<string, { isSum: number; isCount: number; conversions: number; costMicros: number; clicks: number }>();

  for (const r of auctionCampaignRows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const isShare = num(m?.search_impression_share ?? m?.searchImpressionShare);
    const conversions = num(m?.conversions);
    const costMicros = num(m?.cost_micros ?? m?.costMicros);
    const clicks = num(m?.clicks) || 1;
    if (cid) {
      const existing = byCampaign.get(cid);
      if (existing) {
        existing.isSum += isShare;
        existing.isCount += 1;
        existing.conversions += conversions;
        existing.costMicros += costMicros;
        existing.clicks += clicks;
      } else {
        byCampaign.set(cid, { isSum: isShare, isCount: 1, conversions, costMicros, clicks });
      }
    }
  }

  const totalConversions = campaignStats.reduce((s, c) => s + c.conversions, 0);
  const totalCost = campaignStats.reduce((s, c) => s + c.costMicros, 0);
  const accountConvRate = totalCost > 0 && totalConversions > 0 ? totalConversions / (totalCost / 1e6) : 0;

  for (const [cid, data] of byCampaign) {
    const searchImpressionShare = data.isCount > 0 ? data.isSum / data.isCount : 0;
    if (searchImpressionShare <= 0) continue;
    const convRate = data.costMicros > 0 && data.conversions > 0 ? data.conversions / (data.costMicros / 1e6) : 0;
    const isHigh = searchImpressionShare >= 0.5;
    const convRateLow = accountConvRate > 0 && convRate < accountConvRate * 0.7;
    const convGood = data.conversions >= 5 && (accountConvRate === 0 || convRate >= accountConvRate * 0.9);
    const isLow = searchImpressionShare < 0.3;
    if (isHigh && convRateLow) reduceIds.add(cid);
    if (isLow && convGood) allowIncreaseIds.add(cid);
  }
  return { reduceCampaignIds: reduceIds, allowIncreaseCampaignIds: allowIncreaseIds };
}

/**
 * Click Quality Index 0–1: ratio of GA4 sessions to Ads clicks (capped at 1).
 * Low CQI → prioritize intent cuts and schedule reductions.
 */
export function computeClickQualityIndex(adsClicks: number, ga4Sessions: number): number {
  if (adsClicks <= 0) return 1;
  const ratio = ga4Sessions / adsClicks;
  return Math.max(0, Math.min(1, Math.round(ratio * 100) / 100));
}
