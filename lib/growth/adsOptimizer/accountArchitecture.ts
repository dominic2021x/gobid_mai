import "server-only";
import type { OptimizerAction } from "./planSchema";

const BRAND_TERMS = ["gobid", "gobid.ro"];
const SIGNAL_DENSITY_MIN_CONVERSIONS = 30;
const BCI_TOP_PCT = 0.2;
const BCI_THRESHOLD = 0.6;
const STABILITY_VARIANCE_THRESHOLD = 0.25;

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(val: unknown): string {
  if (val == null) return "";
  return String(val).toLowerCase().trim();
}

function isBrandKeyword(keywordText: string): boolean {
  const lower = keywordText.toLowerCase();
  return BRAND_TERMS.some((t) => lower.includes(t));
}

/**
 * Brand isolation: if brand + non-brand in same campaign/ad group → SUGGEST_SPLIT_BRAND_CAMPAIGN, SUGGEST_BRAND_NEGATIVE_PROTECTION.
 */
export function computeBrandIsolationActions(
  keywordResults: unknown[]
): { actions: OptimizerAction[]; brandIsolationDetected: boolean } {
  const actions: OptimizerAction[] = [];
  const rows = keywordResults as Array<Record<string, unknown>>;
  const byCampaignAdGroup = new Map<
    string,
    { campaignId: string; campaignName: string; adGroupId: string; adGroupName: string; hasBrand: boolean; hasNonBrand: boolean }
  >();
  const campaignsWithMixed = new Set<string>();

  for (const r of rows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const keywordText = str(keyword?.text);
    if (!keywordText) continue;
    const cid = str(camp?.id);
    const agid = str(adGroup?.id);
    if (!cid || !agid) continue;
    const key = `${cid}:${agid}`;
    const brand = isBrandKeyword(keywordText);
    const existing = byCampaignAdGroup.get(key);
    if (existing) {
      if (brand) existing.hasBrand = true;
      else existing.hasNonBrand = true;
    } else {
      byCampaignAdGroup.set(key, {
        campaignId: cid,
        campaignName: str(camp?.name),
        adGroupId: agid,
        adGroupName: str(adGroup?.name),
        hasBrand: brand,
        hasNonBrand: !brand,
      });
    }
  }

  for (const [, data] of byCampaignAdGroup) {
    if (data.hasBrand && data.hasNonBrand) {
      campaignsWithMixed.add(data.campaignId);
      actions.push({
        type: "SUGGEST_SPLIT_BRAND_CAMPAIGN",
        campaignId: data.campaignId,
        campaignName: data.campaignName || undefined,
        adGroupId: data.adGroupId,
        adGroupName: data.adGroupName || undefined,
        reason: "Brand and non-brand keywords in same campaign/ad group; consider splitting brand into dedicated campaign.",
        confidence: 0.85,
      });
    }
  }

  for (const campaignId of campaignsWithMixed) {
    actions.push({
      type: "SUGGEST_BRAND_NEGATIVE_PROTECTION",
      campaignId,
      reason: "Add brand terms as negatives in non-brand campaigns to protect brand traffic.",
      confidence: 0.8,
    });
  }

  return { actions, brandIsolationDetected: actions.length > 0 };
}

/**
 * Signal density: if conversions 30d < 30 and strategy in [TARGET_CPA, MAXIMIZE_CONVERSIONS] → SUGGEST_SIGNAL_DENSITY_FIX.
 * Returns score 0–1 (1 = enough conversions).
 */
export function computeSignalDensityActions(
  campaignStats: Array<{ campaignId: string; conversions: number; biddingStrategyType?: string }>
): { actions: OptimizerAction[]; signalDensityScore: number } {
  const actions: OptimizerAction[] = [];
  const totalConv = campaignStats.reduce((s, c) => s + c.conversions, 0);
  const score = totalConv >= SIGNAL_DENSITY_MIN_CONVERSIONS ? 1 : Math.min(1, totalConv / SIGNAL_DENSITY_MIN_CONVERSIONS);

  if (totalConv >= SIGNAL_DENSITY_MIN_CONVERSIONS) return { actions, signalDensityScore: score };

  const targetStrategies = ["TARGET_CPA", "MAXIMIZE_CONVERSIONS"];
  for (const c of campaignStats) {
    const strategy = str(c.biddingStrategyType).toUpperCase();
    if (targetStrategies.includes(strategy)) {
      actions.push({
        type: "SUGGEST_SIGNAL_DENSITY_FIX",
        campaignId: c.campaignId,
        conversions30d: c.conversions,
        currentStrategy: strategy,
        reason: `Low conversion volume (${c.conversions} in 30d); ${strategy} needs more data. Consider manual CPC or consolidate to improve signal density.`,
        confidence: 0.8,
      });
    }
  }
  return { actions, signalDensityScore: score };
}

/**
 * LP relevance: CTR high and conv rate low (vs account) → SUGGEST_LP_RELEVANCE_FIX.
 */
export function computeLPRelevanceActions(
  keywordResults: unknown[],
  accountCtr: number,
  accountConvRate: number
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const rows = keywordResults as Array<Record<string, unknown>>;
  const byKeyword = new Map<string, { clicks: number; impressions: number; conversions: number }>();

  for (const r of rows) {
    const agc = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const keyword = (agc?.keyword ?? (agc as Record<string, unknown>)?.keyword) as Record<string, unknown> | undefined;
    const text = str(keyword?.text);
    if (!text) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const clicks = num(m?.clicks ?? m?.Clicks);
    const impressions = num(m?.impressions ?? m?.Impressions) || 1;
    const conversions = num(m?.conversions);
    const existing = byKeyword.get(text);
    if (existing) {
      existing.clicks += clicks;
      existing.impressions += impressions;
      existing.conversions += conversions;
    } else {
      byKeyword.set(text, { clicks, impressions, conversions });
    }
  }

  for (const [keywordText, data] of byKeyword) {
    if (data.impressions < 100 || data.clicks < 10) continue;
    const ctr = data.clicks / data.impressions;
    const convRate = data.clicks > 0 ? data.conversions / data.clicks : 0;
    if (accountCtr > 0 && accountConvRate > 0 && ctr > accountCtr * 1.2 && convRate < accountConvRate * 0.5) {
      actions.push({
        type: "SUGGEST_LP_RELEVANCE_FIX",
        keywordText,
        ctr: Math.round(ctr * 10000) / 100,
        conversionRate: Math.round(convRate * 100) / 100,
        reason: `High CTR but low conversion rate; landing page may not match intent.`,
        confidence: 0.75,
      });
    }
  }
  return actions;
}

/**
 * Budget concentration: BCI = spend top 20% campaigns / total spend. If BCI < 0.6 → SUGGEST_BUDGET_CONSOLIDATION.
 */
export function computeBudgetConcentrationAction(
  campaignStats: Array<{ campaignId: string; costMicros: number }>
): { action: OptimizerAction | null; budgetConcentrationIndex: number } {
  if (campaignStats.length === 0) return { action: null, budgetConcentrationIndex: 1 };
  const total = campaignStats.reduce((s, c) => s + c.costMicros, 0);
  if (total <= 0) return { action: null, budgetConcentrationIndex: 1 };
  const sorted = [...campaignStats].sort((a, b) => b.costMicros - a.costMicros);
  const topCount = Math.max(1, Math.ceil(sorted.length * BCI_TOP_PCT));
  const topSpend = sorted.slice(0, topCount).reduce((s, c) => s + c.costMicros, 0);
  const bci = topSpend / total;

  if (bci >= BCI_THRESHOLD) return { action: null, budgetConcentrationIndex: Math.round(bci * 100) / 100 };

  return {
    action: {
      type: "SUGGEST_BUDGET_CONSOLIDATION",
      budgetConcentrationIndex: Math.round(bci * 100) / 100,
      reason: `Budget spread across many campaigns (BCI ${(bci * 100).toFixed(0)}%); consider consolidating for efficiency.`,
      confidence: 0.8,
    },
    budgetConcentrationIndex: Math.round(bci * 100) / 100,
  };
}

/**
 * Stability: CPC and conv rate variance from 14d daily data. If variance > threshold → INSTABILITY_HIGH, block auto-apply.
 * Returns stabilityScore 0–1 (1 = stable) and risk flag.
 */
export function computeStabilityScore(
  performance14dRows: unknown[]
): { stabilityScore: number; riskFlags: string[] } {
  const rows = performance14dRows as Array<Record<string, unknown>>;
  const byDate = new Map<string, { costMicros: number; clicks: number; conversions: number }>();

  for (const r of rows) {
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const dateStr = str(seg?.date ?? seg?.Date).slice(0, 10);
    if (!dateStr) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const cost = num(m?.costMicros ?? m?.cost_micros);
    const clicks = num(m?.clicks ?? m?.Clicks) || 1;
    const conversions = num(m?.conversions);
    const existing = byDate.get(dateStr);
    if (existing) {
      existing.costMicros += cost;
      existing.clicks += clicks;
      existing.conversions += conversions;
    } else {
      byDate.set(dateStr, { costMicros: cost, clicks, conversions });
    }
  }

  const dates = Array.from(byDate.keys()).sort();
  if (dates.length < 3) return { stabilityScore: 1, riskFlags: [] };

  const cpcByDay = dates.map((d) => {
    const x = byDate.get(d)!;
    return x.costMicros / x.clicks;
  });
  const convRateByDay = dates.map((d) => {
    const x = byDate.get(d)!;
    return x.clicks > 0 ? x.conversions / x.clicks : 0;
  });

  const variance = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  };
  const cv = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (mean === 0) return 0;
    return Math.sqrt(variance(arr)) / mean;
  };

  const cpcCv = cv(cpcByDay);
  const convRateCv = cv(convRateByDay);
  const maxCv = Math.max(cpcCv, convRateCv);
  const stabilityScore = maxCv >= STABILITY_VARIANCE_THRESHOLD ? Math.max(0, 1 - maxCv) : 1;
  const riskFlags = maxCv >= STABILITY_VARIANCE_THRESHOLD ? ["INSTABILITY_HIGH"] : [];

  return { stabilityScore: Math.round(stabilityScore * 100) / 100, riskFlags };
}
