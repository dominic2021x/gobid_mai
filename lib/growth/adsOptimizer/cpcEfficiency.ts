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

/** Ad network type enum values from Google Ads API. */
const SEARCH_PARTNERS = "SEARCH_PARTNERS";
const CONTENT = "CONTENT";
const SEARCH = "SEARCH";

/**
 * From network_performance snapshot: suggest/apply disable search partners when partners spend > threshold and 0 conversions.
 * Flag DISPLAY_LEAK when Display (CONTENT) traffic on campaigns intended for Search.
 */
export function computeNetworkActions(
  networkResults: unknown[],
  options: {
    networkCostThresholdMicros: number;
    allowDisableSearchPartners: boolean;
  }
): { actions: OptimizerAction[]; riskFlags: string[] } {
  const actions: OptimizerAction[] = [];
  const riskFlags: string[] = [];
  const rows = networkResults as Array<Record<string, unknown>>;

  const byCampaignNetwork = new Map<
    string,
    { campaignName: string; costMicros: number; conversions: number; clicks: number }
  >();

  for (const r of rows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(camp?.id);
    const campaignName = str(camp?.name);
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const networkType = str(seg?.ad_network_type ?? seg?.adNetworkType);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const clicks = num(m?.clicks);
    const key = `${campaignId}:${networkType}`;
    const existing = byCampaignNetwork.get(key) ?? { campaignName, costMicros: 0, conversions: 0, clicks: 0 };
    byCampaignNetwork.set(key, {
      campaignName: existing.campaignName || campaignName,
      costMicros: existing.costMicros + costMicros,
      conversions: existing.conversions + conversions,
      clicks: existing.clicks + clicks,
    });
  }

  const campaignIds = new Set<string>();
  byCampaignNetwork.forEach((_, k) => campaignIds.add(k.split(":")[0]));

  for (const campaignId of campaignIds) {
    const partnersKey = `${campaignId}:${SEARCH_PARTNERS}`;
    const contentKey = `${campaignId}:${CONTENT}`;
    const searchKey = `${campaignId}:${SEARCH}`;

    const partnersData = byCampaignNetwork.get(partnersKey);
    const contentData = byCampaignNetwork.get(contentKey);
    const searchData = byCampaignNetwork.get(searchKey);

    if (partnersData && partnersData.costMicros >= options.networkCostThresholdMicros && partnersData.conversions === 0) {
      actions.push({
        type: "SUGGEST_DISABLE_SEARCH_PARTNERS",
        campaignId,
        campaignName: partnersData.campaignName || undefined,
        costMicros: partnersData.costMicros,
        conversions: 0,
        reason: `Search Partners spend ${partnersData.costMicros} micros, 0 conversions; consider disabling.`,
        confidence: 0.85,
      });
      riskFlags.push("PARTNERS_WASTE");
      if (options.allowDisableSearchPartners) {
        actions.push({
          type: "APPLY_DISABLE_SEARCH_PARTNERS",
          campaignId,
          campaignName: partnersData.campaignName || undefined,
          reason: "Disable Search Partners (guarded).",
          confidence: 0.8,
          autoApplyEligible: false,
        });
      }
    }

    if (contentData && contentData.costMicros > 0 && searchData && searchData.costMicros > 0) {
      riskFlags.push("DISPLAY_LEAK");
    }
  }

  return { actions, riskFlags: [...new Set(riskFlags)] };
}

/**
 * From matchtype_performance snapshot: evidence-based ADD_NEGATIVE_KEYWORDS for waste; optional PAUSE_KEYWORD when allowed.
 */
export function computeMatchTypeActions(
  matchtypeResults: unknown[],
  options: { allowPauseKeyword: boolean; wasteCostThresholdMicros?: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const wasteThreshold = options.wasteCostThresholdMicros ?? 500000;
  const rows = matchtypeResults as Array<Record<string, unknown>>;

  const byCampaignKeyword = new Map<
    string,
    { campaignId: string; keywordText: string; matchType: string; campaignName: string; adGroupId: string; criterionId: string; resourceName: string; costMicros: number; conversions: number }
  >();

  for (const r of rows) {
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const keywordText = str(keyword?.text);
    const matchType = str(keyword?.match_type ?? keyword?.matchType ?? "BROAD");
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const campaignId = str(camp?.id);
    const adGroupId = str(adGroup?.id);
    const criterionId = str(agc?.criterion_id ?? agc?.criterionId);
    const resourceName = str(agc?.resource_name ?? agc?.resourceName);
    const campaignName = str(camp?.name);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);

    const key = `${campaignId}:${adGroupId}:${criterionId}`;
    const existing = byCampaignKeyword.get(key);
    if (existing) {
      existing.costMicros += costMicros;
      existing.conversions += conversions;
    } else {
      byCampaignKeyword.set(key, {
        campaignId,
        keywordText,
        matchType,
        campaignName,
        adGroupId,
        criterionId,
        resourceName,
        costMicros,
        conversions,
      });
    }
  }

  for (const [, data] of byCampaignKeyword) {
    if (data.costMicros >= wasteThreshold && data.conversions < 1 && data.keywordText) {
      const evidence = [{ term: data.keywordText, costMicros: data.costMicros, conversions: data.conversions }];
      actions.push({
        type: "ADD_NEGATIVE_KEYWORDS",
        campaignId: data.campaignId,
        keywords: [data.keywordText],
        matchType: data.matchType === "EXACT" ? "EXACT" : "PHRASE",
        reason: `Match-type waste: ${data.keywordText} (${data.matchType}) cost ${data.costMicros} micros, 0 conversions.`,
        confidence: 0.85,
        evidence,
        autoApplyEligible: true,
      });

      if (options.allowPauseKeyword && data.resourceName) {
        actions.push({
          type: "PAUSE_KEYWORD",
          criterionId: data.criterionId,
          adGroupId: data.adGroupId,
          campaignId: data.campaignId,
          resourceName: data.resourceName,
          keywordText: data.keywordText,
          matchType: data.matchType,
          reason: `Pause low-performing keyword (guarded): ${data.keywordText}.`,
          confidence: 0.8,
          autoApplyEligible: false,
        });
      }
    }
  }

  return actions;
}

/** High-intent keywords (Romanian auction/transaction). */
const HIGH_INTENT_WORDS = ["pret", "licitatie", "cumpăr", "cumperi", "vanzare", "vânzare", "oferta", "ofertă", "executare", "teren intravilan"];

/** Low-intent keywords. */
const LOW_INTENT_WORDS = ["poze", "imagini", "ce este", "definitie", "definiție", "gratis"];

/**
 * Heuristic intent score from keyword text (Romanian market).
 */
export function computeIntentScore(keywordText: string): "low" | "neutral" | "high" {
  const lower = keywordText.toLowerCase().trim();
  if (!lower) return "neutral";
  for (const w of LOW_INTENT_WORDS) {
    if (lower.includes(w)) return "low";
  }
  for (const w of HIGH_INTENT_WORDS) {
    if (lower.includes(w)) return "high";
  }
  return "neutral";
}

/**
 * Auction pressure: SUGGEST_QS_IMPROVEMENT when rank_lost > 30% and QS low; COMPETITION_SPIKE when avg CPC spike > 25% vs 14d.
 * Snapshot shape: { campaigns: [...], keywords: [...] }.
 */
export function computeAuctionPressureActions(
  auctionSnapshot: { campaigns?: unknown[]; keywords?: unknown[] },
  options: {
    rankLostThresholdPct: number;
    qsLowMax: number;
    avgCpc14dByCampaign?: Map<string, number>;
  }
): { actions: OptimizerAction[]; riskFlags: string[] } {
  const actions: OptimizerAction[] = [];
  const riskFlags: string[] = [];
  const rankLostThreshold = (options.rankLostThresholdPct ?? 30) / 100;
  const qsLowMax = options.qsLowMax ?? 5;

  const keywordRows = (auctionSnapshot.keywords ?? []) as Array<Record<string, unknown>>;
  for (const r of keywordRows) {
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const rankLost = num(m?.search_rank_lost_impression_share ?? m?.searchRankLostImpressionShare);
    const agcRecord = agc as Record<string, unknown> | undefined;
    const qualityInfo = agcRecord?.quality_info as { quality_score?: number } | undefined;
    const qs = num(m?.historical_quality_score ?? m?.historicalQualityScore ?? qualityInfo?.quality_score ?? 10);
    if (rankLost >= rankLostThreshold && qs <= qsLowMax) {
      const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
      const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
      const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
      actions.push({
        type: "SUGGEST_QS_IMPROVEMENT",
        criterionId: str(agc?.criterion_id ?? agc?.criterionId),
        adGroupId: str(adGroup?.id),
        campaignId: str(camp?.id),
        keywordText: str(keyword?.text),
        qualityScore: qs,
        searchRankLostImpressionShare: rankLost,
        reason: `Rank lost IS ${(rankLost * 100).toFixed(0)}%, QS ${qs}; improve ad relevance/landing.`,
        confidence: 0.85,
      });
    }
  }

  const campaignRows = (auctionSnapshot.campaigns ?? []) as Array<Record<string, unknown>>;
  const avgCpc14dByCampaign = options.avgCpc14dByCampaign ?? new Map<string, number>();
  for (const r of campaignRows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const avgCpc30d = num(m?.average_cpc ?? m?.averageCpc);
    const avgCpc14d = avgCpc14dByCampaign.get(cid);
    if (avgCpc14d != null && avgCpc14d > 0 && avgCpc30d > avgCpc14d * 1.25) {
      riskFlags.push("COMPETITION_SPIKE");
      break;
    }
  }

  for (const r of campaignRows) {
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const budgetLost = num(m?.search_budget_lost_impression_share ?? m?.searchBudgetLostImpressionShare);
    if (budgetLost >= 0.3) {
      riskFlags.push("BUDGET_LOST_HIGH");
      break;
    }
  }

  return { actions, riskFlags: [...new Set(riskFlags)] };
}

const MAX_BID_MODIFIER_PCT = 20;

/**
 * Intent-based ADJUST_KEYWORD_BID_MODIFIER: low intent reduce 10–20%, high intent + good CPA slight increase (clamped ±20%).
 */
export function computeIntentBidModifierActions(
  matchtypeResults: unknown[],
  keywordBidsResults: unknown[],
  accountAvgCpaMicros: number
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const bidsByKey = new Map<string, number>();
  for (const r of keywordBidsResults as Array<Record<string, unknown>>) {
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    const adGroupId = str(adGroup?.id);
    const criterionId = str(agc?.criterion_id ?? agc?.criterionId);
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const text = str(keyword?.text);
    const bid = num(agc?.cpc_bid_micros ?? (agc as Record<string, unknown>)?.cpcBidMicros);
    if (cid && adGroupId && criterionId && bid > 0) bidsByKey.set(`${cid}:${adGroupId}:${criterionId}`, bid);
  }

  const byKey = new Map<
    string,
    { campaignId: string; adGroupId: string; criterionId: string; resourceName: string; keywordText: string; costMicros: number; conversions: number; bidMicros: number }
  >();
  for (const r of matchtypeResults as Array<Record<string, unknown>>) {
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    const adGroupId = str(adGroup?.id);
    const criterionId = str(agc?.criterion_id ?? agc?.criterionId);
    const resourceName = str(agc?.resource_name ?? agc?.resourceName);
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const keywordText = str(keyword?.text);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const key = `${cid}:${adGroupId}:${criterionId}`;
    const bidMicros = bidsByKey.get(key) ?? 0;
    if (!keywordText || bidMicros <= 0) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.costMicros += costMicros;
      existing.conversions += conversions;
    } else {
      byKey.set(key, { campaignId: cid, adGroupId, criterionId, resourceName, keywordText, costMicros, conversions, bidMicros });
    }
  }

  for (const [, data] of byKey) {
    const intent = computeIntentScore(data.keywordText);
    const cpa = data.conversions > 0 ? data.costMicros / data.conversions : Infinity;
    const cpaGood = accountAvgCpaMicros > 0 && cpa <= accountAvgCpaMicros * 1.2;
    const maxRatio = 1 + MAX_BID_MODIFIER_PCT / 100;
    const minRatio = 1 - MAX_BID_MODIFIER_PCT / 100;
    let newBidMicros = data.bidMicros;
    if (intent === "low") {
      newBidMicros = Math.round(data.bidMicros * 0.85);
      newBidMicros = Math.max(Math.round(data.bidMicros * minRatio), newBidMicros);
    } else if (intent === "high" && cpaGood) {
      newBidMicros = Math.round(data.bidMicros * 1.1);
      newBidMicros = Math.min(Math.round(data.bidMicros * maxRatio), newBidMicros);
    } else {
      continue;
    }
    if (newBidMicros === data.bidMicros) continue;
    actions.push({
      type: "ADJUST_KEYWORD_BID_MODIFIER",
      criterionId: data.criterionId,
      adGroupId: data.adGroupId,
      campaignId: data.campaignId,
      resourceName: data.resourceName || undefined,
      keywordText: data.keywordText,
      currentBidMicros: data.bidMicros,
      newBidMicros,
      intentScore: intent,
      reason: intent === "low" ? `Low intent keyword: reduce bid.` : `High intent, CPA good: slight bid increase.`,
      confidence: 0.8,
      autoApplyEligible: false,
    });
  }
  return actions;
}
