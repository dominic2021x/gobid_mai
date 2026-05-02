import "server-only";
import type { OptimizerAction } from "./planSchema";

const ELASTICITY_HIGH_THRESHOLD = 1;
const ELASTICITY_LOW_THRESHOLD = 0.5;
const MARGINAL_CPA_VS_AVG_RATIO = 1.5;
const CPC_STABLE_PCT = 0.15;

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

/** LTV-aware profit: estimatedLTV = avg_revenue_per_user * (1 + repeat_purchase_rate), maxSustainableCPA = estimatedLTV * target_margin */
export function computeLtvProfitModel(
  avgRevenuePerUser: number,
  repeatPurchaseRate: number,
  targetMarginDecimal: number
): { estimatedLTV: number; maxSustainableCpaMicros: number } {
  if (avgRevenuePerUser <= 0 || targetMarginDecimal <= 0) {
    return { estimatedLTV: 0, maxSustainableCpaMicros: 0 };
  }
  const estimatedLTV = avgRevenuePerUser * (1 + repeatPurchaseRate);
  const maxSustainableCPA = estimatedLTV * targetMarginDecimal;
  return { estimatedLTV, maxSustainableCpaMicros: Math.round(maxSustainableCPA * 1e6) };
}

/** Campaigns with CPA above maxSustainableCPA (same logic as profit zone, different ceiling). */
export function computeCampaignsAboveSustainableCpa(
  campaignStats: Array<{ campaignId: string; costMicros: number; conversions: number }>,
  maxSustainableCpaMicros: number
): string[] {
  const out: string[] = [];
  for (const c of campaignStats) {
    if (c.conversions <= 0) continue;
    const campaignCpaMicros = c.costMicros / c.conversions;
    if (campaignCpaMicros > maxSustainableCpaMicros) out.push(c.campaignId);
  }
  return out;
}

type Row28d = Record<string, unknown>;

function aggregateByCampaignAndDateRange(
  rows: Row28d[],
  dateFilter: (dateStr: string) => boolean
): Map<string, { costMicros: number; conversions: number; clicks: number; impressions: number }> {
  const byCampaign = new Map<string, { costMicros: number; conversions: number; clicks: number; impressions: number }>();
  for (const r of rows) {
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const dateStr = str(seg?.date ?? seg?.Date).slice(0, 10);
    if (!dateFilter(dateStr)) continue;
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = str(camp?.id);
    if (!cid) continue;
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const clicks = num(m?.clicks ?? m?.Clicks);
    const impressions = num(m?.impressions ?? m?.Impressions);
    const existing = byCampaign.get(cid) ?? { costMicros: 0, conversions: 0, clicks: 0, impressions: 0 };
    byCampaign.set(cid, {
      costMicros: existing.costMicros + costMicros,
      conversions: existing.conversions + conversions,
      clicks: existing.clicks + clicks,
      impressions: existing.impressions + impressions,
    });
  }
  return byCampaign;
}

/** Split 28d rows into two 14d windows (first 14 days = previous, last 14 days = last). Dates are YYYY-MM-DD, sort to get order. */
function getDateBounds(rows: Row28d[]): { datesAsc: string[] } {
  const dateSet = new Set<string>();
  for (const r of rows) {
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const d = str(seg?.date ?? seg?.Date).slice(0, 10);
    if (d.length === 10) dateSet.add(d);
  }
  const datesAsc = Array.from(dateSet).sort();
  return { datesAsc };
}

const CAPITAL_PROTECTION_CPA_RATIO = 1.3;

/** Capital protection: if account 7d CPA > 14d CPA * 1.3 → true (add risk flag, block scaling 14d). */
export function computeCapitalProtection(rows28d: Row28d[]): boolean {
  const { datesAsc } = getDateBounds(rows28d);
  if (datesAsc.length < 14) return false;
  const last7Dates = new Set(datesAsc.slice(-7));
  const last14Dates = new Set(datesAsc.slice(-14));
  const last7 = aggregateByCampaignAndDateRange(rows28d, (d) => last7Dates.has(d));
  const last14 = aggregateByCampaignAndDateRange(rows28d, (d) => last14Dates.has(d));
  let cost7 = 0;
  let conv7 = 0;
  let cost14 = 0;
  let conv14 = 0;
  for (const [, v] of last7) {
    cost7 += v.costMicros;
    conv7 += v.conversions;
  }
  for (const [, v] of last14) {
    cost14 += v.costMicros;
    conv14 += v.conversions;
  }
  if (conv7 <= 0 || conv14 <= 0) return false;
  const cpa7d = cost7 / conv7;
  const cpa14d = cost14 / conv14;
  return cpa7d > cpa14d * CAPITAL_PROTECTION_CPA_RATIO;
}

/**
 * Scaling window: 7d CPA < 14d CPA AND conversion rate increasing AND CPC stable → SUGGEST_SCALE_WINDOW.
 */
export function computeScalingWindowActions(
  rows28d: Row28d[]
): { actions: OptimizerAction[]; scaleWindowCampaignIds: string[] } {
  const actions: OptimizerAction[] = [];
  const scaleWindowCampaignIds: string[] = [];
  const { datesAsc } = getDateBounds(rows28d);
  if (datesAsc.length < 14) return { actions, scaleWindowCampaignIds };

  const last7Dates = new Set(datesAsc.slice(-7));
  const last14Dates = new Set(datesAsc.slice(-14));
  const prev14Dates = new Set(datesAsc.slice(0, 14));

  const last7 = aggregateByCampaignAndDateRange(rows28d, (d) => last7Dates.has(d));
  const last14 = aggregateByCampaignAndDateRange(rows28d, (d) => last14Dates.has(d));
  const prev14 = aggregateByCampaignAndDateRange(rows28d, (d) => prev14Dates.has(d));

  for (const [cid, l7] of last7) {
    const l14 = last14.get(cid);
    if (!l14 || l7.conversions <= 0 || l14.conversions <= 0 || l7.clicks <= 0 || l14.clicks <= 0) continue;
    const cpa7d = l7.costMicros / l7.conversions;
    const cpa14d = l14.costMicros / l14.conversions;
    const convRate7d = l7.conversions / l7.clicks;
    const convRate14d = l14.conversions / l14.clicks;
    const cpc7d = l7.clicks > 0 ? l7.costMicros / l7.clicks : 0;
    const cpc14d = l14.clicks > 0 ? l14.costMicros / l14.clicks : 0;
    const cpcStable = cpc14d > 0 && Math.abs(cpc7d - cpc14d) / cpc14d <= CPC_STABLE_PCT;
    if (cpa7d < cpa14d && convRate7d > convRate14d && cpcStable) {
      scaleWindowCampaignIds.push(cid);
      actions.push({
        type: "SUGGEST_SCALE_WINDOW",
        campaignId: cid,
        cpa7d: Math.round(cpa7d / 1e6 * 100) / 100,
        cpa14d: Math.round(cpa14d / 1e6 * 100) / 100,
        reason: "7d CPA below 14d CPA, conversion rate improving, CPC stable; consider scaling budget.",
        confidence: 0.8,
      });
    }
  }
  return { actions, scaleWindowCampaignIds };
}

/**
 * Budget elasticity: last 14d vs previous 14d. elasticity = (delta conv % ) / (delta spend %).
 * If elasticity > 1 → allow increase; if < 0.5 → SUGGEST_MARGINAL_CPA_REDUCTION.
 */
export function computeBudgetElasticity(
  rows28d: Row28d[]
): {
  allowIncreaseCampaignIds: Set<string>;
  actions: OptimizerAction[];
  elasticityByCampaign: Map<string, number>;
} {
  const allowIncreaseCampaignIds = new Set<string>();
  const actions: OptimizerAction[] = [];
  const elasticityByCampaign = new Map<string, number>();
  const { datesAsc } = getDateBounds(rows28d);
  if (datesAsc.length < 28) return { allowIncreaseCampaignIds, actions, elasticityByCampaign };

  const prev14Dates = new Set(datesAsc.slice(0, 14));
  const last14Dates = new Set(datesAsc.slice(14, 28));

  const prev14 = aggregateByCampaignAndDateRange(rows28d, (d) => prev14Dates.has(d));
  const last14 = aggregateByCampaignAndDateRange(rows28d, (d) => last14Dates.has(d));

  for (const [cid, prev] of prev14) {
    const last = last14.get(cid);
    if (!last || prev.costMicros <= 0 || prev.conversions <= 0) continue;
    const deltaSpend = last.costMicros - prev.costMicros;
    const deltaConv = last.conversions - prev.conversions;
    const spendPct = deltaSpend / prev.costMicros;
    const convPct = prev.conversions > 0 ? deltaConv / prev.conversions : 0;
    const elasticity = spendPct !== 0 ? convPct / spendPct : 0;
    elasticityByCampaign.set(cid, Math.round(elasticity * 100) / 100);
    if (elasticity > ELASTICITY_HIGH_THRESHOLD) allowIncreaseCampaignIds.add(cid);
    if (elasticity < ELASTICITY_LOW_THRESHOLD && elasticity >= -10) {
      actions.push({
        type: "SUGGEST_MARGINAL_CPA_REDUCTION",
        campaignId: cid,
        elasticity: Math.round(elasticity * 100) / 100,
        reason: `Budget elasticity low (${(elasticity * 100).toFixed(0)}%); marginal returns diminishing. Consider reducing spend.`,
        confidence: 0.75,
      });
    }
  }
  return { allowIncreaseCampaignIds, actions, elasticityByCampaign };
}

/**
 * Marginal CPA: last 7d vs previous 7d. marginalCpa = delta cost / delta conv. If marginal >> avg → SUGGEST_BUDGET_CAP.
 */
export function computeMarginalCpaActions(
  rows28d: Row28d[],
  campaignAvgCpaMicros: Map<string, number>
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const { datesAsc } = getDateBounds(rows28d);
  if (datesAsc.length < 14) return actions;

  const last7Dates = new Set(datesAsc.slice(-7));
  const prev7Dates = new Set(datesAsc.slice(-14, -7));

  const last7 = aggregateByCampaignAndDateRange(rows28d, (d) => last7Dates.has(d));
  const prev7 = aggregateByCampaignAndDateRange(rows28d, (d) => prev7Dates.has(d));

  for (const [cid, l7] of last7) {
    const p7 = prev7.get(cid);
    if (!p7) continue;
    const deltaCost = l7.costMicros - p7.costMicros;
    const deltaConv = l7.conversions - p7.conversions;
    if (deltaConv <= 0) continue;
    const marginalCpaMicros = deltaCost / deltaConv;
    const avgCpa = campaignAvgCpaMicros.get(cid) ?? 0;
    if (avgCpa <= 0) continue;
    if (marginalCpaMicros >= avgCpa * MARGINAL_CPA_VS_AVG_RATIO) {
      actions.push({
        type: "SUGGEST_BUDGET_CAP",
        campaignId: cid,
        marginalCpaMicros: Math.round(marginalCpaMicros),
        averageCpaMicros: Math.round(avgCpa),
        reason: `Marginal CPA (${(marginalCpaMicros / 1e6).toFixed(2)}) well above average (${(avgCpa / 1e6).toFixed(2)}); consider capping budget.`,
        confidence: 0.75,
      });
    }
  }
  return actions;
}
