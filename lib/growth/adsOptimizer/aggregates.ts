import "server-only";

const TOP_N = 20;

interface CampaignRow {
  campaign?: { id?: string; name?: string; campaignBudget?: string };
  campaignBudget?: { amountMicros?: string; resourceName?: string };
  metrics?: {
    costMicros?: string;
    clicks?: string;
    impressions?: string;
    conversions?: string;
  };
}

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
 * Build compact aggregates from campaign_performance snapshot for LLM input.
 */
export function buildCampaignAggregates(reportResults: unknown[]): string {
  const rows = reportResults as CampaignRow[];
  const campaigns = rows.map((r) => {
    const rc = (r as Record<string, unknown>).campaign as Record<string, unknown> | undefined;
    const id = str(r.campaign?.id ?? rc?.id);
    const name = str(r.campaign?.name ?? rc?.name);
    const rm = (r as Record<string, unknown>).metrics as Record<string, unknown> | undefined;
    const costMicros = num(r.metrics?.costMicros ?? rm?.cost_micros);
    const clicks = num(r.metrics?.clicks ?? rm?.clicks ?? 0);
    const impressions = num(r.metrics?.impressions ?? rm?.impressions ?? 0);
    const conversions = num(r.metrics?.conversions ?? rm?.conversions ?? 0);
    const budgetObj = (r.campaignBudget ?? (r as Record<string, unknown>).campaign_budget) as Record<string, unknown> | undefined;
    const amountMicros = num(budgetObj?.amountMicros ?? budgetObj?.amount_micros);
    const budgetResourceName = str(budgetObj?.resourceName ?? budgetObj?.resource_name);
    return {
      id,
      name,
      costMicros,
      clicks,
      impressions,
      conversions,
      amountMicros,
      budgetResourceName,
      costPerConv: conversions > 0 ? costMicros / conversions : 0,
    };
  });

  const bySpend = [...campaigns].sort((a, b) => b.costMicros - a.costMicros).slice(0, TOP_N);
  const byCostPerConv = [...campaigns]
    .filter((c) => c.conversions > 0)
    .sort((a, b) => b.costPerConv - a.costPerConv)
    .slice(0, TOP_N);
  const byConversions = [...campaigns].sort((a, b) => b.conversions - a.conversions).slice(0, TOP_N);

  const lines: string[] = [
    "## Top campaigns by spend (last 30d)",
    bySpend
      .map(
        (c) =>
          `id=${c.id} name=${JSON.stringify(c.name)} costMicros=${c.costMicros} budgetMicros=${c.amountMicros} budgetRn=${c.budgetResourceName || "n/a"} clicks=${c.clicks} conv=${c.conversions}`
      )
      .join("\n"),
    "",
    "## Top campaigns by cost per conversion (with conv>0)",
    byCostPerConv
      .map(
        (c) =>
          `id=${c.id} name=${JSON.stringify(c.name)} costPerConvMicros=${Math.round(c.costPerConv)} costMicros=${c.costMicros} conv=${c.conversions}`
      )
      .join("\n"),
    "",
    "## Top campaigns by conversions",
    byConversions
      .map(
        (c) =>
          `id=${c.id} name=${JSON.stringify(c.name)} conversions=${c.conversions} costMicros=${c.costMicros} budgetMicros=${c.amountMicros}`
      )
      .join("\n"),
  ];
  return lines.join("\n");
}

/**
 * Build compact summary of conversion actions for LLM.
 */
export function buildConversionActionsSummary(actions: unknown[]): string {
  const list = (actions as Array<{ conversion_action?: { id?: string; name?: string }; conversionAction?: { id?: string; name?: string } }>)
    .map((a) => {
      const ca = a.conversion_action ?? a.conversionAction ?? a;
      const id = String((ca as { id?: string }).id ?? "");
      const name = String((ca as { name?: string }).name ?? "");
      return { id, name };
    })
    .slice(0, 50);
  return "Conversion actions (id, name):\n" + list.map((c) => `${c.id} ${JSON.stringify(c.name)}`).join("\n");
}

/** Search term / keyword row from snapshot (search_terms or keyword_waste). */
interface SearchTermRow {
  search_term_view?: { search_term?: string };
  searchTermView?: { searchTerm?: string };
  ad_group_criterion?: { keyword?: { text?: string } };
  adGroupCriterion?: { keyword?: { text?: string } };
  campaign?: { id?: string; name?: string };
  ad_group?: { id?: string; name?: string };
  metrics?: { impressions?: string; clicks?: string; cost_micros?: string; costMicros?: string; conversions?: string };
}

/**
 * Build waste terms aggregate from search_terms snapshot (high cost, low/zero conversions).
 * Used for evidence-based negative keyword suggestions.
 */
export function buildSearchTermsWaste(searchTermsResults: unknown[]): string {
  const rows = searchTermsResults as SearchTermRow[];
  const terms = rows.map((r) => {
    const ro = r as Record<string, unknown>;
    const stv = ro.search_term_view as Record<string, unknown> | undefined;
    const agc = (ro.ad_group_criterion ?? ro.adGroupCriterion) as Record<string, unknown> | undefined;
    const kw = agc?.keyword as Record<string, unknown> | undefined;
    const term = str(
      r.search_term_view?.search_term ?? stv?.search_term ?? r.ad_group_criterion?.keyword?.text ?? kw?.text
    );
    const m = (r.metrics ?? (r as Record<string, unknown>).metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const impressions = num(m?.impressions);
    const campaignId = str(r.campaign?.id ?? (r.campaign as Record<string, unknown>)?.id);
    const adGroupId = str(r.ad_group?.id ?? (r.ad_group as Record<string, unknown>)?.id);
    return { term, costMicros, conversions, impressions, campaignId, adGroupId };
  });
  const waste = terms
    .filter((t) => t.term && t.costMicros > 0 && t.conversions < 1)
    .sort((a, b) => b.costMicros - a.costMicros)
    .slice(0, 50);
  if (waste.length === 0) return "No high-cost zero-conversion search terms in snapshot.";
  return (
    "Waste terms (term, costMicros, conversions, campaignId, adGroupId):\n" +
    waste.map((t) => `${JSON.stringify(t.term)} costMicros=${t.costMicros} conv=${t.conversions} campaignId=${t.campaignId} adGroupId=${t.adGroupId}`).join("\n")
  );
}

/**
 * Compute conversion readiness score (0–1) from report + conversion_actions.
 * Low when: no conversion actions, or campaigns have very few conversions.
 */
export function computeReadinessScore(
  reportResults: unknown[],
  conversionActionsCount: number
): number {
  const rows = reportResults as CampaignRow[];
  const totalConversions = rows.reduce((sum, r) => {
    const rm = (r as Record<string, unknown>).metrics as Record<string, unknown> | undefined;
    return sum + num(r.metrics?.conversions ?? rm?.conversions);
  }, 0);
  const totalCost = rows.reduce((sum, r) => {
    const rm = (r as Record<string, unknown>).metrics as Record<string, unknown> | undefined;
    return sum + num(r.metrics?.costMicros ?? rm?.cost_micros);
  }, 0);
  if (conversionActionsCount === 0) return 0;
  if (totalCost <= 0) return 0.2;
  const hasConversions = totalConversions >= 1;
  const conversionRate = totalCost > 0 ? totalConversions / (totalCost / 1e6) : 0;
  const score = hasConversions ? Math.min(1, 0.3 + conversionRate * 2 + (conversionActionsCount >= 3 ? 0.2 : 0)) : 0.1;
  return Math.round(score * 100) / 100;
}

export type StatisticalConfidenceLevel = "low" | "medium" | "high";

/**
 * Compute statistical confidence from campaign-level conversions (account total).
 * - conversions >= 20 → high
 * - 10–19 → medium
 * - <10 → low
 */
export function computeStatisticalConfidence(
  campaignStats: Array<{ conversions: number }>
): { level: StatisticalConfidenceLevel } {
  const totalConversions = campaignStats.reduce((s, c) => s + c.conversions, 0);
  if (totalConversions >= 20) return { level: "high" };
  if (totalConversions >= 10) return { level: "medium" };
  return { level: "low" };
}

/** Campaign stat with budget and bidding for reallocation and guardrails. */
export interface CampaignStatWithBudget {
  campaignId: string;
  conversions: number;
  costMicros: number;
  clicks: number;
  amountMicros: number;
  budgetResourceName: string;
  biddingStrategyType?: string;
  targetCpaMicros?: number;
  targetRoas?: number;
}

/**
 * Build campaign stats with budget and optional bidding from report results (campaign_performance or campaign_performance_with_bidding).
 */
export function buildCampaignStatsWithBudget(reportResults: unknown[]): CampaignStatWithBudget[] {
  const rows = reportResults as Array<Record<string, unknown>>;
  const byCampaign = new Map<string, CampaignStatWithBudget>();
  for (const r of rows) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = str(camp?.id ?? (camp as { id?: string })?.id);
    if (!cid) continue;
    const budgetObj = (r.campaignBudget ?? r.campaign_budget) as Record<string, unknown> | undefined;
    const amountMicros = num(budgetObj?.amountMicros ?? budgetObj?.amount_micros);
    const budgetRn = str(budgetObj?.resourceName ?? budgetObj?.resource_name);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const clicks = num(m?.clicks ?? m?.Clicks);
    const existing = byCampaign.get(cid);
    if (existing) {
      existing.costMicros += costMicros;
      existing.conversions += conversions;
      existing.clicks += clicks;
    } else {
      const campObj = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
      const tcpaObj = campObj?.target_cpa ?? (campObj as Record<string, unknown>)?.targetCpa;
      const tCpaMicros = tcpaObj && typeof tcpaObj === "object" ? num((tcpaObj as Record<string, unknown>).target_cpa_micros ?? (tcpaObj as Record<string, unknown>).targetCpaMicros) : undefined;
      const troasVal = campObj?.target_roas ?? (campObj as Record<string, unknown>)?.targetRoas;
      const tRoas = troasVal != null ? num(troasVal) : undefined;
      byCampaign.set(cid, {
        campaignId: cid,
        conversions,
        costMicros,
        clicks,
        amountMicros,
        budgetResourceName: budgetRn,
        biddingStrategyType: camp ? str((camp as Record<string, unknown>).bidding_strategy_type ?? (camp as Record<string, unknown>).biddingStrategyType) : undefined,
        targetCpaMicros: tCpaMicros && tCpaMicros > 0 ? tCpaMicros : undefined,
        targetRoas: tRoas && tRoas > 0 ? tRoas : undefined,
      });
    }
  }
  return Array.from(byCampaign.values());
}

/**
 * Compute conversion lag risk: last 3 days drop but 14-day stable.
 * performance14dRows must have segments.date and metrics.conversions.
 */
export function computeConversionLagRisk(performance14dRows: unknown[]): { conversionLagDetected: boolean } {
  const rows = performance14dRows as Array<Record<string, unknown>>;
  if (rows.length === 0) return { conversionLagDetected: false };

  const byDate = new Map<string, number>();
  for (const r of rows) {
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const dateStr = String(seg?.date ?? seg?.Date ?? "").slice(0, 10);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const conv = num(m?.conversions ?? m?.Conversions);
    if (dateStr) byDate.set(dateStr, (byDate.get(dateStr) ?? 0) + conv);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  if (sortedDates.length < 4) return { conversionLagDetected: false };

  const last3Dates = sortedDates.slice(-3);
  const last3Conversions = last3Dates.reduce((s, d) => s + (byDate.get(d) ?? 0), 0);
  const total14d = sortedDates.reduce((s, d) => s + (byDate.get(d) ?? 0), 0);
  const expectedLast3 = total14d * (3 / Math.min(14, sortedDates.length));
  const drop = expectedLast3 > 0 ? (expectedLast3 - last3Conversions) / expectedLast3 : 0;
  const conversionLagDetected = total14d >= 5 && drop > 0.3;
  return { conversionLagDetected };
}

/**
 * Smart CPC floor: effectiveTargetCPC = targetCPA * conversionRate (conversionRate = conversions/clicks).
 * Returns per-campaign signals and account-level effective target CPC for display.
 */
export function computeSmartCpcFloorSignals(
  campaignStats: Array<{
    campaignId: string;
    costMicros: number;
    conversions: number;
    clicks: number;
    targetCpaMicros?: number;
    amountMicros: number;
  }>,
  totalCostMicros: number,
  totalConversions: number
): {
  allowReductionCampaignIds: Set<string>;
  allowReallocationCampaignIds: Set<string>;
  effectiveTargetCpcMicrosByCampaign: Map<string, number>;
} {
  const allowReduction = new Set<string>();
  const allowReallocation = new Set<string>();
  const effectiveTargetCpcMicrosByCampaign = new Map<string, number>();
  const totalClicks = campaignStats.reduce((s, c) => s + c.clicks, 0);
  const accountConversionRate = totalClicks > 0 && totalConversions > 0 ? totalConversions / totalClicks : 0;

  for (const c of campaignStats) {
    const clicks = c.clicks > 0 ? c.clicks : 1;
    const conversionRate = c.conversions > 0 ? c.conversions / clicks : accountConversionRate;
    const targetCpa = c.targetCpaMicros ?? (totalConversions > 0 ? totalCostMicros / totalConversions : 0);
    const effectiveTargetCpc = targetCpa > 0 && conversionRate > 0 ? targetCpa * conversionRate : 0;
    effectiveTargetCpcMicrosByCampaign.set(c.campaignId, Math.round(effectiveTargetCpc));
    const avgCpc = c.costMicros / clicks;
    if (effectiveTargetCpc > 0 && avgCpc > effectiveTargetCpc * 1.3) allowReduction.add(c.campaignId);
    if (effectiveTargetCpc > 0 && avgCpc < effectiveTargetCpc * 0.7 && c.amountMicros > 0) allowReallocation.add(c.campaignId);
  }
  return { allowReductionCampaignIds: allowReduction, allowReallocationCampaignIds: allowReallocation, effectiveTargetCpcMicrosByCampaign };
}
