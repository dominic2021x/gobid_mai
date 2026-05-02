import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting, getGrowthSettingNumber, getGrowthSettingBoolean, getGrowthSettingStringArray } from "@/lib/growth/settings";
import { enqueueJob } from "@/lib/growth/jobs";
import { chatCompletion } from "@/lib/growth/llm";
import { buildCampaignAggregates, buildConversionActionsSummary, buildSearchTermsWaste, computeReadinessScore, computeStatisticalConfidence, buildCampaignStatsWithBudget, computeConversionLagRisk, computeSmartCpcFloorSignals, type StatisticalConfidenceLevel } from "@/lib/growth/adsOptimizer/aggregates";
import { buildOptimizerUserPromptV3, OPTIMIZER_SYSTEM_PROMPT_V3 } from "@/lib/growth/adsOptimizer/prompt";
import { validatePlanGuardrails } from "@/lib/growth/adsOptimizer/guardrails";
import { computeBudgetReallocation } from "@/lib/growth/adsOptimizer/reallocation";
import { optimizerPlanSchemaV10_1, type OptimizerPlanV10_1, type OptimizerAction } from "@/lib/growth/adsOptimizer/planSchema";
import { computeQualityScoreActions, computeHourlyActions, computeDeviceActions, computeGeoActions } from "@/lib/growth/adsOptimizer/cpcReduction";
import { computeNetworkActions, computeMatchTypeActions, computeAuctionPressureActions, computeIntentBidModifierActions } from "@/lib/growth/adsOptimizer/cpcEfficiency";
import { computeSearchTermClusterActions, computeBiddingStrategySuggestions, computeImpressionShareSignals, computeClickQualityIndex } from "@/lib/growth/adsOptimizer/structuralEfficiency";
import { computeBrandIsolationActions, computeSignalDensityActions, computeLPRelevanceActions, computeBudgetConcentrationAction, computeStabilityScore } from "@/lib/growth/adsOptimizer/accountArchitecture";
import { computeFunnelLeakActions, computeMicroConversionAction, computeHighIntentCampaignSplitActions, computeKeywordMiningActions, computeProfitSensitivity } from "@/lib/growth/adsOptimizer/conversionSystem";
import { computeLtvProfitModel, computeCampaignsAboveSustainableCpa, computeScalingWindowActions, computeBudgetElasticity, computeMarginalCpaActions, computeCapitalProtection } from "@/lib/growth/adsOptimizer/economicControl";
import { runGaql } from "@/lib/google/apis/googleAds";
import { pullGA4SessionsByDate, pullGA4FunnelEventCounts } from "@/lib/google/apis/ga4";

const CUSTOMER_KEY = "google_ads_customer_id";
const PRODUCT = "google_ads";

async function getCustomerId(): Promise<string> {
  const id = await getGrowthSetting(CUSTOMER_KEY);
  if (!id || !id.trim()) throw new Error("google_ads_customer_id not set in growth_settings");
  return id.trim();
}

async function getLatestSnapshot(
  supabase: SupabaseClient,
  product: string,
  kind: string,
  scopeRef: string
): Promise<{ result: Record<string, unknown> } | null> {
  const { data } = await supabase
    .from("growth_google_snapshots")
    .select("result")
    .eq("product", product)
    .eq("kind", kind)
    .eq("scope_ref", scopeRef)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { result: Record<string, unknown> } | null;
}

/**
 * Check if we already have a plan for this customer today (UTC). If so and not forced, skip generation.
 */
async function getExistingPlanToday(
  supabase: SupabaseClient,
  scopeRef: string,
  forced: boolean
): Promise<{ id: string } | null> {
  if (forced) return null;
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const iso = startOfToday.toISOString();
  const { data } = await supabase
    .from("growth_ai_plans")
    .select("id")
    .eq("product", PRODUCT)
    .eq("scope_ref", scopeRef)
    .gte("created_at", iso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string } | null;
}

export async function handleGoogleAdsOptimizerPlan(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const adsOptimizerEnabled = await getGrowthSettingBoolean("ads_optimizer_enabled", true);
  if (!adsOptimizerEnabled) {
    return { ok: true, meta: { skipped: "Optimizer disabled via ads_optimizer_enabled" } };
  }
  const customerId = await getCustomerId();
  const forced = payload.force === true;

  const reportSnap = await getLatestSnapshot(supabase, PRODUCT, "report", customerId);
  const actionsSnap = await getLatestSnapshot(supabase, PRODUCT, "conversion_actions", customerId);

  if (!reportSnap?.result || !actionsSnap?.result) {
    const enqueued: string[] = [];
    if (!reportSnap?.result) {
      const { jobId } = await enqueueJob({ type: "google_ads_report", payload: { queryId: "campaign_performance" } }, supabase);
      enqueued.push(jobId);
    }
    if (!actionsSnap?.result) {
      const { jobId } = await enqueueJob({ type: "google_ads_conversion_actions_refresh", payload: {} }, supabase);
      enqueued.push(jobId);
    }
    const { jobId: searchTermsJobId } = await enqueueJob({ type: "google_ads_search_terms_refresh", payload: {} }, supabase);
    enqueued.push(searchTermsJobId);
    return {
      ok: true,
      meta: { enqueuedRefresh: true, jobIds: enqueued, reason: "Missing snapshots" },
    };
  }

  const existing = await getExistingPlanToday(supabase, customerId, forced);
  if (existing) {
    return { ok: true, meta: { cached: true, planId: existing.id } };
  }

  const reportResults = (reportSnap.result.results ?? reportSnap.result.result ?? []) as unknown[];
  const actionsList = (actionsSnap.result.actions ?? []) as unknown[];
  const campaignAggregates = buildCampaignAggregates(reportResults);
  const conversionSummary = buildConversionActionsSummary(actionsList);
  const readinessScore = computeReadinessScore(reportResults, actionsList.length);

  const campaignStatsWithBudget = buildCampaignStatsWithBudget(reportResults);
  const confidenceResult = computeStatisticalConfidence(campaignStatsWithBudget);
  const confidenceLevel = confidenceResult.level as StatisticalConfidenceLevel;

  const minConv = await getGrowthSettingNumber("ads_min_conversions_for_budget_increase", 5);
  const maxBudgetPct = await getGrowthSettingNumber("ads_max_budget_change_pct", 20);
  const primaryObjective = (await getGrowthSetting("ads_primary_objective")) ?? "CPA_MIN";
  const overlapThreshold = await getGrowthSettingNumber("ads_search_term_overlap_threshold", 3);
  const cqiThreshold = await getGrowthSettingNumber("ads_click_quality_index_threshold", 0.5);

  let reallocationActions: OptimizerAction[] = [];
  let structuralActions: OptimizerAction[] = [];

  const searchTermsStructureSnap = await getLatestSnapshot(supabase, PRODUCT, "search_terms_structure", customerId);
  const searchTermsStructureResults: unknown[] = (searchTermsStructureSnap?.result && (searchTermsStructureSnap.result as { results?: unknown[] }).results) ? ((searchTermsStructureSnap.result as { results: unknown[] }).results ?? []) : [];
  if (searchTermsStructureSnap?.result && Array.isArray(searchTermsStructureResults) && searchTermsStructureResults.length > 0) {
    structuralActions = structuralActions.concat(
      computeSearchTermClusterActions(searchTermsStructureResults, { overlapThreshold, broadOverlapCountThreshold: 5 })
    );
  }
  if (!searchTermsStructureSnap?.result) {
    await enqueueJob({ type: "google_ads_search_terms_structure_refresh", payload: {} }, supabase);
  }
  structuralActions = structuralActions.concat(
    computeBiddingStrategySuggestions(
      campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, conversions: c.conversions, biddingStrategyType: c.biddingStrategyType })),
      { minConversionsForAutoBidding: 30 }
    )
  );

  let searchTermsWaste = "";
  const searchTermsSnap = await getLatestSnapshot(supabase, PRODUCT, "search_terms", customerId);
  if (searchTermsSnap?.result) {
    const stResults = (searchTermsSnap.result.results ?? []) as unknown[];
    searchTermsWaste = buildSearchTermsWaste(stResults);
  } else {
    await enqueueJob({ type: "google_ads_search_terms_refresh", payload: {} }, supabase);
  }

  let ga4Summary = "";
  const ga4PropertyId = await getGrowthSetting("ga4_property_id");
  if (ga4PropertyId?.trim()) {
    const ga4Snap = await getLatestSnapshot(supabase, "ga4", "report", ga4PropertyId.trim());
    if (ga4Snap?.result) {
      const rows = (ga4Snap.result.rows ?? []) as Array<Record<string, unknown>>;
      ga4Summary = rows.slice(0, 15).map((r) => JSON.stringify(r)).join("\n");
    }
  }

  const biddingStrategyAware = campaignStatsWithBudget.some((c) => c.biddingStrategyType && c.biddingStrategyType.length > 0);

  let cpcActions: OptimizerAction[] = [];
  const cpcRiskFlags: string[] = [];
  const allowPauseLowQs = await getGrowthSettingBoolean("ads_allow_pause_low_qs_keyword", false);
  const hourlyCostThreshold = await getGrowthSettingNumber("ads_hourly_cost_threshold_micros", 1000000);
  const totalCost = campaignStatsWithBudget.reduce((s, c) => s + c.costMicros, 0);
  const totalConversions = campaignStatsWithBudget.reduce((s, c) => s + c.conversions, 0);
  const accountAvgCpa = totalConversions > 0 ? totalCost / totalConversions : 0;

  const keywordQualitySnap = await getLatestSnapshot(supabase, PRODUCT, "keyword_quality", customerId);
  if (keywordQualitySnap?.result) {
    const kqResults = (keywordQualitySnap.result.results ?? []) as unknown[];
    cpcActions = cpcActions.concat(
      computeQualityScoreActions(kqResults, { allowPauseLowQsKeyword: allowPauseLowQs, maxPauseQs: 5 })
    );
  } else {
    await enqueueJob({ type: "google_ads_keyword_quality_refresh", payload: {} }, supabase);
  }

  const hourlySnap = await getLatestSnapshot(supabase, PRODUCT, "hourly_performance", customerId);
  if (hourlySnap?.result) {
    const hourlyResults = (hourlySnap.result.results ?? []) as unknown[];
    try {
      const { results: criteriaResults } = await runGaql(customerId, "campaign_criteria_ad_schedule");
      cpcActions = cpcActions.concat(
        computeHourlyActions(hourlyResults, criteriaResults, { costThresholdMicros: hourlyCostThreshold })
      );
    } catch {
      cpcRiskFlags.push("CPC: could not load ad schedule criteria.");
    }
  } else {
    await enqueueJob({ type: "google_ads_hourly_performance_refresh", payload: {} }, supabase);
  }

  const deviceSnap = await getLatestSnapshot(supabase, PRODUCT, "device_performance", customerId);
  if (deviceSnap?.result && accountAvgCpa > 0) {
    const deviceResults = (deviceSnap.result.results ?? []) as unknown[];
    try {
      const { results: criteriaResults } = await runGaql(customerId, "campaign_criteria_device");
      cpcActions = cpcActions.concat(computeDeviceActions(deviceResults, criteriaResults, accountAvgCpa));
    } catch {
      cpcRiskFlags.push("CPC: could not load device criteria.");
    }
  } else if (!deviceSnap?.result) {
    await enqueueJob({ type: "google_ads_device_performance_refresh", payload: {} }, supabase);
  }

  const geoSnap = await getLatestSnapshot(supabase, PRODUCT, "geo_performance", customerId);
  if (geoSnap?.result) {
    const geoResults = (geoSnap.result.results ?? []) as unknown[];
    try {
      const { results: criteriaResults } = await runGaql(customerId, "campaign_criteria_location");
      cpcActions = cpcActions.concat(computeGeoActions(geoResults, criteriaResults, accountAvgCpa));
    } catch {
      cpcRiskFlags.push("CPC: could not load location criteria.");
    }
  } else {
    await enqueueJob({ type: "google_ads_geo_performance_refresh", payload: {} }, supabase);
  }

  let efficiencyActions: OptimizerAction[] = [];
  const efficiencyRiskFlags: string[] = [];
  const networkCostThreshold = await getGrowthSettingNumber("ads_network_cost_threshold_micros", 500000);
  const allowDisableSearchPartners = await getGrowthSettingBoolean("ads_allow_disable_search_partners", false);
  const allowPauseKeyword = await getGrowthSettingBoolean("ads_allow_pause_keyword", false);

  const networkSnap = await getLatestSnapshot(supabase, PRODUCT, "network_performance", customerId);
  if (networkSnap?.result) {
    const netResults = (networkSnap.result.results ?? []) as unknown[];
    const { actions: netActions, riskFlags: netFlags } = computeNetworkActions(netResults, {
      networkCostThresholdMicros: networkCostThreshold,
      allowDisableSearchPartners,
    });
    efficiencyActions = efficiencyActions.concat(netActions);
    efficiencyRiskFlags.push(...netFlags);
  } else {
    await enqueueJob({ type: "google_ads_network_performance_refresh", payload: {} }, supabase);
  }

  const matchtypeSnap = await getLatestSnapshot(supabase, PRODUCT, "matchtype_performance", customerId);
  if (matchtypeSnap?.result) {
    const mtResults = (matchtypeSnap.result.results ?? []) as unknown[];
    efficiencyActions = efficiencyActions.concat(
      computeMatchTypeActions(mtResults, { allowPauseKeyword, wasteCostThresholdMicros: 500000 })
    );
  } else {
    await enqueueJob({ type: "google_ads_matchtype_performance_refresh", payload: {} }, supabase);
  }

  let performance14dRows: unknown[] = [];
  try {
    const { results: perf14d } = await runGaql(customerId, "campaign_performance_14d");
    performance14dRows = perf14d as unknown[];
  } catch {
    performance14dRows = [];
  }
  const { conversionLagDetected } = computeConversionLagRisk(performance14dRows);
  if (conversionLagDetected) efficiencyRiskFlags.push("CONVERSION_LAG");

  const { stabilityScore: earlyStabilityScore, riskFlags: earlyStabilityRiskFlags } = computeStabilityScore(performance14dRows);

  const totalCostForCpc = campaignStatsWithBudget.reduce((s, c) => s + c.costMicros, 0);
  const totalConversionsForCpc = campaignStatsWithBudget.reduce((s, c) => s + c.conversions, 0);
  const { effectiveTargetCpcMicrosByCampaign } = computeSmartCpcFloorSignals(
    campaignStatsWithBudget,
    totalCostForCpc,
    totalConversionsForCpc
  );
  const effectiveTargetCpcMicros =
    effectiveTargetCpcMicrosByCampaign.size > 0
      ? Math.round(
          Array.from(effectiveTargetCpcMicrosByCampaign.values()).reduce((a, b) => a + b, 0) / effectiveTargetCpcMicrosByCampaign.size
        )
      : undefined;

  const avgCpc14dByCampaign = new Map<string, number>();
  const cost14dByCampaign = new Map<string, number>();
  const clicks14dByCampaign = new Map<string, number>();
  const parseNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v).replace(/\D/g, "")) || 0);
  for (const r of performance14dRows as Array<Record<string, unknown>>) {
    const camp = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const cid = String(camp?.id ?? "");
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const cost = parseNum(m?.costMicros ?? m?.cost_micros);
    const clicks = parseNum(m?.clicks ?? m?.Clicks);
    if (cid) {
      cost14dByCampaign.set(cid, (cost14dByCampaign.get(cid) ?? 0) + cost);
      clicks14dByCampaign.set(cid, (clicks14dByCampaign.get(cid) ?? 0) + clicks);
    }
  }
  for (const cid of cost14dByCampaign.keys()) {
    const totalCost = cost14dByCampaign.get(cid) ?? 0;
    const totalClicks = clicks14dByCampaign.get(cid) ?? 1;
    if (totalClicks > 0) avgCpc14dByCampaign.set(cid, totalCost / totalClicks);
  }

  let auctionActions: OptimizerAction[] = [];
  const auctionRiskFlags: string[] = [];
  const auctionSnap = await getLatestSnapshot(supabase, PRODUCT, "auction_pressure", customerId);
  let isSignals: { reduceCampaignIds: Set<string>; allowIncreaseCampaignIds: Set<string> } = { reduceCampaignIds: new Set(), allowIncreaseCampaignIds: new Set() };
  if (auctionSnap?.result && typeof auctionSnap.result === "object") {
    const snap = auctionSnap.result as { campaigns?: unknown[]; keywords?: unknown[] };
    const { actions: apActions, riskFlags: apFlags } = computeAuctionPressureActions(snap, { rankLostThresholdPct: 30, qsLowMax: 5, avgCpc14dByCampaign });
    auctionActions = apActions;
    auctionRiskFlags.push(...apFlags);
    if (Array.isArray(snap.campaigns) && snap.campaigns.length > 0) {
      isSignals = computeImpressionShareSignals(
        campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, conversions: c.conversions, costMicros: c.costMicros, clicks: c.clicks })),
        snap.campaigns as Array<Record<string, unknown>>
      );
    }
  } else {
    await enqueueJob({ type: "google_ads_auction_pressure_refresh", payload: {} }, supabase);
  }

  let performance28dRows: unknown[] = [];
  try {
    const { results: perf28d } = await runGaql(customerId, "campaign_performance_28d");
    performance28dRows = (perf28d ?? []) as unknown[];
  } catch {
    performance28dRows = [];
  }

  let scalingSignals: { scaleWindowCampaignIds?: string[]; elasticityAllowIncreaseCampaignIds?: string[]; elasticityScoreByCampaign?: Record<string, number> } | undefined;
  let economicActions: OptimizerAction[] = [];
  let elasticityScore: number | undefined;
  let elasticityAllowStored: Set<string> = new Set();
  let elasticityByCampaignStored: Map<string, number> = new Map();
  let capitalProtectionActive = false;
  const rows28d = performance28dRows as Array<Record<string, unknown>>;
  const ELASTICITY_CONSERVATIVE_THRESHOLD = 1.2;
  if (rows28d.length > 0) {
    capitalProtectionActive = computeCapitalProtection(rows28d);
    const { actions: scaleActions, scaleWindowCampaignIds } = computeScalingWindowActions(rows28d);
    economicActions.push(...scaleActions);
    const { allowIncreaseCampaignIds: elasticityAllow, actions: elasticityActions, elasticityByCampaign } = computeBudgetElasticity(rows28d);
    economicActions.push(...elasticityActions);
    elasticityAllowStored = elasticityAllow;
    elasticityByCampaignStored = elasticityByCampaign;
    const campaignAvgCpaMicros = new Map<string, number>();
    for (const c of campaignStatsWithBudget) {
      if (c.conversions > 0) campaignAvgCpaMicros.set(c.campaignId, c.costMicros / c.conversions);
    }
    economicActions.push(...computeMarginalCpaActions(rows28d, campaignAvgCpaMicros));
    const elasticityValues = Array.from(elasticityByCampaign.values()).filter((v) => Number.isFinite(v));
    elasticityScore = elasticityValues.length > 0 ? Math.round((elasticityValues.reduce((a, b) => a + b, 0) / elasticityValues.length) * 100) / 100 : undefined;
    scalingSignals = {
      scaleWindowCampaignIds: scaleWindowCampaignIds.length > 0 ? scaleWindowCampaignIds : undefined,
      elasticityAllowIncreaseCampaignIds: elasticityAllow.size > 0 ? Array.from(elasticityAllow) : undefined,
      elasticityScoreByCampaign: elasticityByCampaign.size > 0 ? Object.fromEntries(elasticityByCampaign) : undefined,
    };
  }

  let blockBudgetIncreaseCampaignIds: Set<string> | undefined;
  let maxAffordableCpaMicros: number | undefined;
  let maxSustainableCpaMicros: number | undefined;
  let campaignIdsAboveProfitZone: string[] = [];
  const avgRevenuePerUser = await getGrowthSettingNumber("avg_revenue_per_user", 0);
  const repeatPurchaseRate = await getGrowthSettingNumber("repeat_purchase_rate", 0);
  const avgRevenue = await getGrowthSettingNumber("avg_revenue_per_listing", 0);
  const targetMarginRaw = await getGrowthSettingNumber("target_margin", 0);
  const targetMarginDecimal = targetMarginRaw > 0 && targetMarginRaw <= 1 ? targetMarginRaw : targetMarginRaw / 100;

  if (avgRevenuePerUser > 0 && targetMarginDecimal > 0) {
    const { maxSustainableCpaMicros: maxSust } = computeLtvProfitModel(avgRevenuePerUser, repeatPurchaseRate, targetMarginDecimal);
    maxSustainableCpaMicros = maxSust;
    if (maxSust > 0) {
      campaignIdsAboveProfitZone = computeCampaignsAboveSustainableCpa(
        campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, costMicros: c.costMicros, conversions: c.conversions })),
        maxSust
      );
      if (campaignIdsAboveProfitZone.length > 0) blockBudgetIncreaseCampaignIds = new Set(campaignIdsAboveProfitZone);
    }
  } else if (avgRevenue > 0 && targetMarginDecimal > 0) {
    const profit = computeProfitSensitivity(
      campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, costMicros: c.costMicros, conversions: c.conversions })),
      avgRevenue,
      targetMarginDecimal
    );
    maxAffordableCpaMicros = profit.maxAffordableCpaMicros;
    campaignIdsAboveProfitZone = profit.campaignIdsAboveProfitZone;
    if (profit.campaignIdsAboveProfitZone.length > 0) blockBudgetIncreaseCampaignIds = new Set(profit.campaignIdsAboveProfitZone);
  }

  const allowScalingConservative =
    !capitalProtectionActive &&
    !earlyStabilityRiskFlags.includes("INSTABILITY_HIGH") &&
    campaignIdsAboveProfitZone.length === 0;
  if (allowScalingConservative) {
    for (const cid of elasticityAllowStored) {
      const el = elasticityByCampaignStored.get(cid);
      if (el != null && el > ELASTICITY_CONSERVATIVE_THRESHOLD) isSignals.allowIncreaseCampaignIds.add(cid);
    }
  }

  const stabilityModeMaxBudgetPct = 10;
  const maxBudgetPctStability = Math.min(maxBudgetPct, stabilityModeMaxBudgetPct);

  reallocationActions = computeBudgetReallocation(
    campaignStatsWithBudget.map((c) => ({
      campaignId: c.campaignId,
      conversions: c.conversions,
      costMicros: c.costMicros,
      amountMicros: c.amountMicros,
      budgetResourceName: c.budgetResourceName,
    })),
    {
      minConversionsForBudgetIncrease: minConv,
      maxBudgetChangePct: maxBudgetPctStability,
      allowTotalBudgetIncrease: false,
      allowIncreaseCampaignIds: isSignals.allowIncreaseCampaignIds.size > 0 ? isSignals.allowIncreaseCampaignIds : undefined,
      reduceCampaignIds: isSignals.reduceCampaignIds.size > 0 ? isSignals.reduceCampaignIds : undefined,
      blockBudgetIncreaseCampaignIds,
    }
  );

  let intentActions: OptimizerAction[] = [];
  const mtResults = (matchtypeSnap?.result && (matchtypeSnap.result as { results?: unknown[] }).results) ? ((matchtypeSnap.result as { results: unknown[] }).results ?? []) : ([] as unknown[]);
  if (matchtypeSnap?.result && accountAvgCpa > 0) {
    try {
      const { results: keywordBids } = await runGaql(customerId, "keyword_bids");
      intentActions = computeIntentBidModifierActions(mtResults, keywordBids as unknown[], accountAvgCpa);
    } catch {
      efficiencyRiskFlags.push("Intent bid modifier: could not load keyword_bids.");
    }
  }

  const parseNumReport = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v).replace(/\D/g, "")) || 0);
  let totalImpressions = 0;
  let totalClicksReport = 0;
  let totalConversionsReport = 0;
  for (const r of reportResults as Array<Record<string, unknown>>) {
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    totalImpressions += parseNumReport(m?.impressions ?? m?.Impressions);
    totalClicksReport += parseNumReport(m?.clicks ?? m?.Clicks);
    totalConversionsReport += parseNumReport(m?.conversions ?? m?.Conversions);
  }
  const accountCtr = totalImpressions > 0 ? totalClicksReport / totalImpressions : 0;
  const accountConvRate = totalClicksReport > 0 ? totalConversionsReport / totalClicksReport : 0;

  let architectureActions: OptimizerAction[] = [];
  let brandIsolationDetected = false;
  let signalDensityScore = 1;
  let budgetConcentrationIndex = 1;
  let stabilityScore = 1;
  const architectureRiskFlags: string[] = [];

  const { actions: brandActions, brandIsolationDetected: brandDetected } = computeBrandIsolationActions(mtResults);
  architectureActions.push(...brandActions);
  brandIsolationDetected = brandDetected;

  const { actions: signalActions, signalDensityScore: signalScore } = computeSignalDensityActions(
    campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, conversions: c.conversions, biddingStrategyType: c.biddingStrategyType }))
  );
  architectureActions.push(...signalActions);
  signalDensityScore = signalScore;

  if (mtResults.length > 0 && accountCtr > 0 && accountConvRate > 0) {
    architectureActions.push(...computeLPRelevanceActions(mtResults, accountCtr, accountConvRate));
  }

  const { action: bciAction, budgetConcentrationIndex: bci } = computeBudgetConcentrationAction(
    campaignStatsWithBudget.map((c) => ({ campaignId: c.campaignId, costMicros: c.costMicros }))
  );
  budgetConcentrationIndex = bci;
  if (bciAction) architectureActions.push(bciAction);

  stabilityScore = earlyStabilityScore;
  architectureRiskFlags.push(...earlyStabilityRiskFlags);

  let conversionSystemActions: OptimizerAction[] = [];
  let funnelMetrics: { sessions: number; signups: number; publishListing: number; paidBoost?: number; sessionToSignupPct?: number; signupToPublishPct?: number; publishToPaidPct?: number } | undefined;
  const conversionSystemRiskFlags: string[] = [];
  if (campaignIdsAboveProfitZone.length > 0 && (maxAffordableCpaMicros != null || maxSustainableCpaMicros != null)) {
    conversionSystemRiskFlags.push("CPA_ABOVE_PROFIT_ZONE");
  }
  if (capitalProtectionActive) conversionSystemRiskFlags.push("CAPITAL_PROTECTION_ACTIVE");
  const funnelDropThresholdPct = await getGrowthSettingNumber("funnel_drop_threshold_pct", 40);
  const keywordMiningClicksThreshold = await getGrowthSettingNumber("keyword_mining_clicks_threshold", 20);

  if (ga4PropertyId?.trim()) {
    try {
      const { eventCounts } = await pullGA4FunnelEventCounts(ga4PropertyId.trim(), 30);
      const { actions: funnelActions, funnelMetrics: fm } = computeFunnelLeakActions(eventCounts, { dropThresholdPct: funnelDropThresholdPct });
      conversionSystemActions.push(...funnelActions);
      funnelMetrics = fm;
      const microAction = computeMicroConversionAction(totalConversionsReport, eventCounts);
      if (microAction) conversionSystemActions.push(microAction);
    } catch {
      conversionSystemRiskFlags.push("Funnel events unavailable");
    }
  }
  conversionSystemActions.push(...computeHighIntentCampaignSplitActions(mtResults));
  if (searchTermsStructureResults.length > 0) {
    conversionSystemActions.push(...computeKeywordMiningActions(searchTermsStructureResults, { clicksThreshold: keywordMiningClicksThreshold }));
  }

  let llmSummary = "Deterministic reallocation applied.";
  let llmActions: OptimizerAction[] = [];
  let llmRiskFlags: string[] = [];
  try {
    const userPromptV3 = buildOptimizerUserPromptV3(
      customerId,
      campaignAggregates,
      conversionSummary,
      ga4Summary,
      searchTermsWaste || undefined,
      reallocationActions.length
    );
    const rawResponse = await chatCompletion([
      { role: "system", content: OPTIMIZER_SYSTEM_PROMPT_V3 },
      { role: "user", content: userPromptV3 },
    ]);
    const parsed = JSON.parse(rawResponse.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as { summary?: string; actions?: unknown[]; riskFlags?: string[] };
    if (parsed.summary) llmSummary = parsed.summary;
    if (Array.isArray(parsed.actions)) {
      for (const a of parsed.actions) {
        const act = a as Record<string, unknown>;
        if (act.type === "REFRESH_SNAPSHOTS" || act.type === "SUGGEST_LANDING_PAGE_FIX" || act.type === "ADD_NEGATIVE_KEYWORDS") {
          llmActions.push(act as OptimizerAction);
        }
      }
    }
    if (Array.isArray(parsed.riskFlags)) llmRiskFlags = parsed.riskFlags;
  } catch {
    llmRiskFlags.push("LLM unavailable; plan contains deterministic actions only.");
  }

  let clickQualityIndex: number | undefined;
  const totalClicks = campaignStatsWithBudget.reduce((s, c) => s + c.clicks, 0);
  if (ga4PropertyId?.trim() && totalClicks > 0) {
    try {
      const { byDate } = await pullGA4SessionsByDate(ga4PropertyId.trim(), 14);
      const totalGa4Sessions = Array.from(byDate.values()).reduce((a, b) => a + b, 0);
      clickQualityIndex = computeClickQualityIndex(totalClicks, totalGa4Sessions);
      if (clickQualityIndex < cqiThreshold) llmRiskFlags.push("LOW_CLICK_QUALITY");
    } catch {
      clickQualityIndex = undefined;
    }
  }

  const mergedActions: OptimizerAction[] = [
    ...reallocationActions,
    ...cpcActions,
    ...efficiencyActions,
    ...structuralActions,
    ...auctionActions,
    ...intentActions,
    ...architectureActions,
    ...conversionSystemActions,
    ...economicActions,
    ...llmActions,
  ];
  llmRiskFlags = [...cpcRiskFlags, ...efficiencyRiskFlags, ...auctionRiskFlags, ...architectureRiskFlags, ...conversionSystemRiskFlags, ...llmRiskFlags];
  const deterministicCount =
    reallocationActions.length +
    cpcActions.length +
    efficiencyActions.length +
    structuralActions.length +
    auctionActions.length +
    intentActions.length +
    architectureActions.length +
    conversionSystemActions.length +
    economicActions.length;
  const cpcReductionMode = cpcActions.length > 0;
  const trafficQualityMode = efficiencyRiskFlags.length > 0;
  const intentMode = intentActions.length > 0;
  const auctionAware = auctionActions.length > 0 || auctionRiskFlags.length > 0;
  const structuralMode = structuralActions.length > 0;
  const architectureMode = architectureActions.length > 0;
  const conversionSystemMode = conversionSystemActions.length > 0 || funnelMetrics != null || (maxAffordableCpaMicros != null && maxAffordableCpaMicros > 0) || (maxSustainableCpaMicros != null && maxSustainableCpaMicros > 0);
  const economicMode = economicActions.length > 0 || scalingSignals != null || (maxSustainableCpaMicros != null && maxSustainableCpaMicros > 0);
  const primaryObjectiveVal = ["CPC_MIN", "CPA_MIN", "VOLUME_MAX", "ROAS_MAX"].includes(primaryObjective) ? primaryObjective : "CPA_MIN";

  const planV10_1: OptimizerPlanV10_1 = {
    planVersion: 10.1,
    customerId,
    generatedAt: new Date().toISOString(),
    summary: llmSummary,
    conversionReadinessScore: readinessScore,
    planType: readinessScore < 0.3 ? "tracking_only" : "full",
    statisticalConfidenceLevel: confidenceLevel,
    deterministicActionsCount: deterministicCount,
    biddingStrategyAware,
    cpcReductionMode,
    trafficQualityMode,
    intentMode,
    auctionAware,
    structuralMode,
    architectureMode,
    conversionSystemMode,
    economicMode,
    stabilityMode: true,
    brandIsolationDetected,
    signalDensityScore,
    budgetConcentrationIndex,
    stabilityScore,
    maxSustainableCpa: maxSustainableCpaMicros != null ? maxSustainableCpaMicros / 1e6 : undefined,
    maxAffordableCpa: maxAffordableCpaMicros != null ? maxAffordableCpaMicros / 1e6 : undefined,
    campaignIdsAboveProfitZone: campaignIdsAboveProfitZone.length > 0 ? campaignIdsAboveProfitZone : undefined,
    elasticityScore,
    scalingSignals,
    capitalProtectionActive,
    coolingPeriodActive: true,
    funnelMetrics,
    primaryObjective: primaryObjectiveVal as "CPC_MIN" | "CPA_MIN" | "VOLUME_MAX" | "ROAS_MAX",
    clickQualityIndex,
    effectiveTargetCpcMicros,
    actions: mergedActions,
    riskFlags: llmRiskFlags,
  };

  const validated = optimizerPlanSchemaV10_1.safeParse(planV10_1);
  if (!validated.success) {
    const msg = (validated.error as { message?: string }).message ?? "Plan validation failed";
    return { ok: false, error: msg };
  }

  const { data: planRow, error } = await supabase
    .from("growth_ai_plans")
    .insert({
      product: PRODUCT,
      scope_ref: customerId,
      plan: validated.data as unknown as Record<string, unknown>,
      status: "queued",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, meta: { planId: planRow.id } };
}

async function getReportSnapshotCampaignBudgetMap(
  supabase: SupabaseClient,
  customerId: string
): Promise<Map<string, string>> {
  const snap = await getLatestSnapshot(supabase, PRODUCT, "report", customerId);
  const map = new Map<string, string>();
  if (!snap?.result) return map;
  const results = (snap.result.results ?? snap.result.result ?? []) as Array<{
    campaign?: { id?: string };
    campaignBudget?: { resourceName?: string };
  }>;
  for (const r of results) {
    const ro = r as Record<string, unknown>;
    const camp = ro.campaign as Record<string, unknown> | undefined;
    const budget = (ro.campaignBudget ?? ro.campaign_budget) as Record<string, unknown> | undefined;
    const cid = camp?.id ?? r.campaign?.id;
    const rn = budget?.resourceName ?? budget?.resource_name ?? r.campaignBudget?.resourceName;
    if (cid && rn) map.set(String(cid), String(rn));
  }
  return map;
}

export async function handleGoogleAdsApplyPlan(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const planId = payload.planId as string;
  if (!planId) return { ok: false, error: "Missing planId" };

  const adsOptimizerEnabled = await getGrowthSettingBoolean("ads_optimizer_enabled", true);
  if (!adsOptimizerEnabled) {
    return { ok: true, meta: { skipped: "Optimizer disabled via ads_optimizer_enabled" } };
  }

  const { data: planRow, error: fetchErr } = await supabase
    .from("growth_ai_plans")
    .select("id, product, scope_ref, plan, status")
    .eq("id", planId)
    .single();

  if (fetchErr || !planRow) return { ok: false, error: "Plan not found" };
  if (planRow.status !== "queued") {
    return { ok: false, error: `Plan status is ${planRow.status}, cannot apply` };
  }

  const customerId = planRow.scope_ref as string;
  const plan = planRow.plan as { customerId?: string; actions?: unknown[]; riskFlags?: string[] };
  const onlyAutoApplyEligible = payload.onlyAutoApplyEligible === true;

  const [
    maxBudgetPct,
    maxActionsPerDay,
    allowPause,
    allowNegatives,
    minDaysBetweenChanges,
    minConversionsForBudgetIncrease,
    capSpendPerDayMicros,
    autoApplyModeRaw,
    allowPauseLowQsKeyword,
    maxBidModifierChangePct,
    allowDisableSearchPartners,
    allowPauseKeyword,
    minDaysBetweenBudgetChanges,
    minDaysBetweenBidChanges,
  ] = await Promise.all([
    getGrowthSettingNumber("ads_max_budget_change_pct", 20),
    getGrowthSettingNumber("ads_max_actions_per_day", 25),
    getGrowthSettingBoolean("ads_allow_pause", false),
    getGrowthSettingBoolean("ads_allow_negatives", true),
    getGrowthSettingNumber("ads_min_days_between_changes", 3),
    getGrowthSettingNumber("ads_min_conversions_for_budget_increase", 5),
    getGrowthSettingNumber("ads_cap_spend_per_day_micros", 0),
    getGrowthSetting("ads_auto_apply_mode"),
    getGrowthSettingBoolean("ads_allow_pause_low_qs_keyword", false),
    getGrowthSettingNumber("ads_max_bid_modifier_change_pct", 20),
    getGrowthSettingBoolean("ads_allow_disable_search_partners", false),
    getGrowthSettingBoolean("ads_allow_pause_keyword", false),
    getGrowthSettingNumber("ads_min_days_between_budget_changes", 7),
    getGrowthSettingNumber("ads_min_days_between_bid_changes", 5),
  ]);
  const autoApplyMode = (["negatives_only", "budget_decrease_only", "low_risk", "full"].includes(String(autoApplyModeRaw)) ? autoApplyModeRaw : autoApplyModeRaw === "all" ? "full" : "off") as "off" | "negatives_only" | "budget_decrease_only" | "low_risk" | "full";

  const lastApplied = await supabase
    .from("growth_ai_plans")
    .select("updated_at")
    .eq("product", PRODUCT)
    .eq("scope_ref", customerId)
    .eq("status", "applied")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastApplied.data?.updated_at) {
    const updated = new Date(lastApplied.data.updated_at as string).getTime();
    const minMs = minDaysBetweenChanges * 24 * 60 * 60 * 1000;
    if (Date.now() - updated < minMs) {
      return {
        ok: false,
        error: `Cooldown: wait ${minDaysBetweenChanges} days between applies. Last applied at ${lastApplied.data.updated_at}`,
      };
    }
  }

  const reportSnap = await getLatestSnapshot(supabase, PRODUCT, "report", customerId);
  const campaignStats = new Map<string, { conversions: number; costMicros: number; targetCpaMicros?: number }>();
  if (reportSnap?.result) {
    const results = (reportSnap.result.results ?? reportSnap.result.result ?? []) as Array<Record<string, unknown>>;
    for (const r of results) {
      const camp = r.campaign as Record<string, unknown> | undefined;
      const cid = camp?.id as string | undefined;
      if (!cid) continue;
      const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
      const conversions = Number(m?.conversions ?? m?.Conversions ?? 0) || 0;
      const costMicros = Number(m?.costMicros ?? m?.cost_micros ?? 0) || 0;
      const tcpa = (camp?.target_cpa ?? camp?.targetCpa) as Record<string, unknown> | undefined;
      const targetCpaMicros = tcpa ? Number(tcpa?.target_cpa_micros ?? tcpa?.targetCpaMicros ?? 0) || undefined : undefined;
      const existing = campaignStats.get(String(cid)) ?? { conversions: 0, costMicros: 0 };
      campaignStats.set(String(cid), {
        conversions: existing.conversions + conversions,
        costMicros: existing.costMicros + costMicros,
        targetCpaMicros: existing.targetCpaMicros ?? targetCpaMicros,
      });
    }
  }

  const confidenceLevel = (plan as { statisticalConfidenceLevel?: string }).statisticalConfidenceLevel as "low" | "medium" | "high" | undefined;
  const maxTargetCpaChangePct = await getGrowthSettingNumber("ads_max_target_cpa_change_pct", 15);
  const planStabilityMode = (plan as { planVersion?: number; stabilityMode?: boolean }).planVersion === 10.1 || (plan as { stabilityMode?: boolean }).stabilityMode === true;
  const effectiveMaxBudgetPct = planStabilityMode ? Math.min(maxBudgetPct, 10) : maxBudgetPct;
  const killCampaignIds = await getGrowthSettingStringArray("ads_optimizer_kill_campaign_ids", []);
  const pilotCampaignIds = await getGrowthSettingStringArray("ads_optimizer_pilot_campaign_ids", []);

  const guardrailResult = validatePlanGuardrails(
    plan as import("@/lib/growth/adsOptimizer/planSchema").OptimizerPlan,
    {
      maxBudgetChangePct: effectiveMaxBudgetPct,
      maxActionsPerDay: maxActionsPerDay,
      allowPause,
      allowNegatives,
      minDaysBetweenChanges,
      minConversionsForBudgetIncrease,
      capSpendPerDayMicros,
      minReadinessForFullPlan: 0.3,
      autoApplyMode,
      maxTargetCpaChangePct,
      allowPauseLowQsKeyword,
      maxBidModifierChangePct,
      allowDisableSearchPartners,
      allowPauseKeyword,
    },
    maxActionsPerDay,
    campaignStats,
    confidenceLevel
  );

  let budgetChangeBlockedCampaigns = new Set<string>();
  let bidChangeBlocked = false;
  if (minDaysBetweenBudgetChanges > 0 || minDaysBetweenBidChanges > 0) {
    const budgetCutoff = new Date();
    budgetCutoff.setDate(budgetCutoff.getDate() - minDaysBetweenBudgetChanges);
    const bidCutoff = new Date();
    bidCutoff.setDate(bidCutoff.getDate() - minDaysBetweenBidChanges);
    if (minDaysBetweenBudgetChanges > 0) {
      const { data: budgetEvents } = await supabase
        .from("growth_events")
        .select("meta")
        .eq("type", "google_ads_optimizer_budget_after")
        .gte("created_at", budgetCutoff.toISOString());
      for (const e of budgetEvents ?? []) {
        const cid = (e.meta as Record<string, unknown>)?.campaignId as string | undefined;
        if (cid) budgetChangeBlockedCampaigns.add(String(cid));
      }
    }
    if (minDaysBetweenBidChanges > 0) {
      const { data: bidEvent } = await supabase
        .from("growth_events")
        .select("created_at")
        .eq("type", "google_ads_optimizer_adjust_keyword_bid_after")
        .gte("created_at", bidCutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      bidChangeBlocked = bidEvent?.created_at != null;
    }
  }

  let actionsToApply: typeof guardrailResult.allowed;
  const payloadMode = payload.autoApplyMode as string | undefined;
  const riskFlags = (plan as { riskFlags?: string[] }).riskFlags ?? [];
  const blockAutoApply = riskFlags.includes("INSTABILITY_HIGH");

  const filterStabilityAutoApply = (list: typeof guardrailResult.allowed) =>
    list.filter(
      (a) =>
        a.type === "ADD_NEGATIVE_KEYWORDS" ||
        (a.type === "ADJUST_BUDGET" && a.newBudgetMicros < a.currentBudgetMicros) ||
        (a.type === "ADJUST_KEYWORD_BID_MODIFIER" && typeof a.newBidMicros === "number" && typeof a.currentBidMicros === "number" && a.newBidMicros < a.currentBidMicros) ||
        (a.type === "SET_DEVICE_BID_MODIFIER" && (a.newBidModifier ?? 1) < (a.currentBidModifier ?? 1)) ||
        (a.type === "SET_LOCATION_BID_MODIFIER" && (a.newBidModifier ?? 1) < (a.currentBidModifier ?? 1))
    );

  if (payloadMode === "negatives_only") {
    actionsToApply = guardrailResult.allowed.filter((a) => a.type === "ADD_NEGATIVE_KEYWORDS");
  } else if (payloadMode === "budget_decrease_only") {
    actionsToApply = guardrailResult.allowed.filter((a) => a.type === "ADJUST_BUDGET" && a.newBudgetMicros < a.currentBudgetMicros);
  } else if (payloadMode === "low_risk" && guardrailResult.autoApplyAllowed?.length) {
    const list = blockAutoApply ? [] : guardrailResult.autoApplyAllowed;
    actionsToApply = planStabilityMode ? filterStabilityAutoApply(list) : list;
  } else if (payloadMode === "full") {
    actionsToApply = blockAutoApply && onlyAutoApplyEligible ? [] : guardrailResult.allowed;
  } else if (onlyAutoApplyEligible && guardrailResult.autoApplyAllowed?.length) {
    const list = blockAutoApply ? [] : guardrailResult.autoApplyAllowed;
    actionsToApply = planStabilityMode ? filterStabilityAutoApply(list) : list;
  } else {
    actionsToApply = guardrailResult.allowed;
  }

  if (planStabilityMode && (payloadMode === "low_risk" || onlyAutoApplyEligible)) {
    actionsToApply = filterStabilityAutoApply(actionsToApply);
  }

  actionsToApply = actionsToApply.filter((a) => {
    const campaignId = "campaignId" in a && typeof a.campaignId === "string" ? a.campaignId : undefined;
    if (campaignId && killCampaignIds.includes(campaignId)) return false;
    if (pilotCampaignIds.length > 0) {
      if (campaignId && !pilotCampaignIds.includes(campaignId)) return false;
    }
    if (a.type === "ADJUST_BUDGET" && a.newBudgetMicros > a.currentBudgetMicros && budgetChangeBlockedCampaigns.has(a.campaignId)) return false;
    if ((a.type === "ADJUST_KEYWORD_BID_MODIFIER" || a.type === "SET_DEVICE_BID_MODIFIER" || a.type === "SET_LOCATION_BID_MODIFIER") && bidChangeBlocked) return false;
    return true;
  }) as typeof guardrailResult.allowed;

  if (pilotCampaignIds.length > 0) {
    await supabase.from("growth_events").insert({
      type: "google_ads_optimizer_apply_pilot_filter",
      meta: { customerId, planId, pilotCampaignIds, actionsToApplyCount: actionsToApply.length, correlationId },
    });
  }

  const applied: string[] = [];
  const failed: Array<{ action: string; error: string }> = [];
  const budgetMap = await getReportSnapshotCampaignBudgetMap(supabase, customerId);

  const {
    mutateCampaignBudget,
    pauseCampaign,
    addCampaignNegativeKeywords,
    mutateTargetCpa,
    mutateCampaignCriterionBidModifier,
    pauseAdGroupCriterion,
    disableCampaignSearchPartners,
    updateAdGroupCriterionBid,
  } = await import("@/lib/google/apis/googleAds");

  for (const action of actionsToApply) {
    if (action.type === "SUGGEST_LANDING_PAGE_FIX" || action.type === "SUGGEST_AD_COPY_IMPROVEMENT") {
      continue;
    }
    if (action.type === "REFRESH_SNAPSHOTS") {
      const kinds = action.kinds ?? [];
      if (kinds.includes("report")) {
        const { jobId } = await enqueueJob({ type: "google_ads_report", payload: { queryId: "campaign_performance" } }, supabase);
        applied.push(`enqueued report refresh ${jobId}`);
      }
      if (kinds.includes("conversion_actions")) {
        const { jobId } = await enqueueJob({ type: "google_ads_conversion_actions_refresh", payload: {} }, supabase);
        applied.push(`enqueued conversion_actions refresh ${jobId}`);
      }
      if (kinds.includes("search_terms")) {
        const { jobId } = await enqueueJob({ type: "google_ads_search_terms_refresh", payload: {} }, supabase);
        applied.push(`enqueued search_terms refresh ${jobId}`);
      }
      if (kinds.includes("keyword_quality")) {
        const { jobId } = await enqueueJob({ type: "google_ads_keyword_quality_refresh", payload: {} }, supabase);
        applied.push(`enqueued keyword_quality refresh ${jobId}`);
      }
      if (kinds.includes("hourly_performance")) {
        const { jobId } = await enqueueJob({ type: "google_ads_hourly_performance_refresh", payload: {} }, supabase);
        applied.push(`enqueued hourly_performance refresh ${jobId}`);
      }
      if (kinds.includes("device_performance")) {
        const { jobId } = await enqueueJob({ type: "google_ads_device_performance_refresh", payload: {} }, supabase);
        applied.push(`enqueued device_performance refresh ${jobId}`);
      }
      if (kinds.includes("geo_performance")) {
        const { jobId } = await enqueueJob({ type: "google_ads_geo_performance_refresh", payload: {} }, supabase);
        applied.push(`enqueued geo_performance refresh ${jobId}`);
      }
      if (kinds.includes("network_performance")) {
        const { jobId } = await enqueueJob({ type: "google_ads_network_performance_refresh", payload: {} }, supabase);
        applied.push(`enqueued network_performance refresh ${jobId}`);
      }
      if (kinds.includes("matchtype_performance")) {
        const { jobId } = await enqueueJob({ type: "google_ads_matchtype_performance_refresh", payload: {} }, supabase);
        applied.push(`enqueued matchtype_performance refresh ${jobId}`);
      }
      if (kinds.includes("auction_pressure")) {
        const { jobId } = await enqueueJob({ type: "google_ads_auction_pressure_refresh", payload: {} }, supabase);
        applied.push(`enqueued auction_pressure refresh ${jobId}`);
      }
      if (kinds.includes("search_terms_structure")) {
        const { jobId } = await enqueueJob({ type: "google_ads_search_terms_structure_refresh", payload: {} }, supabase);
        applied.push(`enqueued search_terms_structure refresh ${jobId}`);
      }
      continue;
    }

    if (action.type === "ADJUST_KEYWORD_BID_MODIFIER" && action.resourceName) {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_adjust_keyword_bid_before",
          meta: { customerId, planId, criterionId: action.criterionId, campaignId: action.campaignId, adGroupId: action.adGroupId, currentBidMicros: action.currentBidMicros, newBidMicros: action.newBidMicros, correlationId },
        });
        await updateAdGroupCriterionBid(customerId, action.resourceName, action.newBidMicros);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_adjust_keyword_bid_after",
          meta: { customerId, planId, criterionId: action.criterionId, newBidMicros: action.newBidMicros, correlationId },
        });
        applied.push(`ADJUST_KEYWORD_BID_MODIFIER criterion ${action.criterionId}`);
      } catch (e) {
        failed.push({ action: "ADJUST_KEYWORD_BID_MODIFIER", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "ADJUST_BUDGET") {
      const budgetRn = action.budgetResourceName ?? budgetMap.get(action.campaignId);
      if (!budgetRn) {
        failed.push({ action: "ADJUST_BUDGET", error: `No budget resource for campaign ${action.campaignId}` });
        continue;
      }
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_budget_before",
          meta: { customerId, planId, campaignId: action.campaignId, currentBudgetMicros: action.currentBudgetMicros, newBudgetMicros: action.newBudgetMicros, correlationId },
        });
        await mutateCampaignBudget(customerId, budgetRn, action.newBudgetMicros);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_budget_after",
          meta: { customerId, planId, campaignId: action.campaignId, newBudgetMicros: action.newBudgetMicros, correlationId },
        });
        applied.push(`ADJUST_BUDGET campaign ${action.campaignId}`);
      } catch (e) {
        failed.push({ action: "ADJUST_BUDGET", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "PAUSE_ENTITY" && action.entityType === "campaign") {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_before",
          meta: { customerId, planId, entityType: action.entityType, entityId: action.entityId, correlationId },
        });
        await pauseCampaign(customerId, action.entityId);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_after",
          meta: { customerId, planId, entityId: action.entityId, correlationId },
        });
        applied.push(`PAUSE_ENTITY campaign ${action.entityId}`);
      } catch (e) {
        failed.push({ action: "PAUSE_ENTITY", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "ADD_NEGATIVE_KEYWORDS" && action.campaignId && action.keywords?.length) {
      const matchType = (action.matchType === "EXACT" || action.matchType === "BROAD" ? action.matchType : "PHRASE") as "EXACT" | "PHRASE" | "BROAD";
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_negatives_before",
          meta: { customerId, planId, campaignId: action.campaignId, keywords: action.keywords, correlationId },
        });
        const { added } = await addCampaignNegativeKeywords(customerId, action.campaignId, action.keywords, matchType);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_negatives_after",
          meta: { customerId, planId, campaignId: action.campaignId, added, correlationId },
        });
        applied.push(`ADD_NEGATIVE_KEYWORDS campaign ${action.campaignId} (${added} keywords)`);
      } catch (e) {
        failed.push({ action: "ADD_NEGATIVE_KEYWORDS", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "ADJUST_TARGET_CPA") {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_target_cpa_before",
          meta: { customerId, planId, campaignId: action.campaignId, currentTargetCpaMicros: action.currentTargetCpaMicros, newTargetCpaMicros: action.newTargetCpaMicros, correlationId },
        });
        await mutateTargetCpa(customerId, action.campaignId, action.newTargetCpaMicros);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_target_cpa_after",
          meta: { customerId, planId, campaignId: action.campaignId, newTargetCpaMicros: action.newTargetCpaMicros, correlationId },
        });
        applied.push(`ADJUST_TARGET_CPA campaign ${action.campaignId}`);
      } catch (e) {
        failed.push({ action: "ADJUST_TARGET_CPA", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "PAUSE_LOW_QS_KEYWORD" && action.resourceName) {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_low_qs_before",
          meta: { customerId, planId, criterionId: action.criterionId, campaignId: action.campaignId, adGroupId: action.adGroupId, correlationId },
        });
        await pauseAdGroupCriterion(customerId, action.resourceName);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_low_qs_after",
          meta: { customerId, planId, criterionId: action.criterionId, correlationId },
        });
        applied.push(`PAUSE_LOW_QS_KEYWORD criterion ${action.criterionId}`);
      } catch (e) {
        failed.push({ action: "PAUSE_LOW_QS_KEYWORD", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "APPLY_DISABLE_SEARCH_PARTNERS") {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_disable_partners_before",
          meta: { customerId, planId, campaignId: action.campaignId, correlationId },
        });
        await disableCampaignSearchPartners(customerId, action.campaignId);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_disable_partners_after",
          meta: { customerId, planId, campaignId: action.campaignId, correlationId },
        });
        applied.push(`APPLY_DISABLE_SEARCH_PARTNERS campaign ${action.campaignId}`);
      } catch (e) {
        failed.push({ action: "APPLY_DISABLE_SEARCH_PARTNERS", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "PAUSE_KEYWORD" && action.resourceName) {
      try {
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_keyword_before",
          meta: { customerId, planId, criterionId: action.criterionId, campaignId: action.campaignId, adGroupId: action.adGroupId, correlationId },
        });
        await pauseAdGroupCriterion(customerId, action.resourceName);
        await supabase.from("growth_events").insert({
          type: "google_ads_optimizer_pause_keyword_after",
          meta: { customerId, planId, criterionId: action.criterionId, correlationId },
        });
        applied.push(`PAUSE_KEYWORD criterion ${action.criterionId}`);
      } catch (e) {
        failed.push({ action: "PAUSE_KEYWORD", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    if (action.type === "ADJUST_AD_SCHEDULE" || action.type === "SET_DEVICE_BID_MODIFIER" || action.type === "SET_LOCATION_BID_MODIFIER") {
      const rn = action.criterionResourceName;
      const mod = action.newBidModifier;
      if (rn != null && mod != null) {
        try {
          await supabase.from("growth_events").insert({
            type: `google_ads_optimizer_${action.type.toLowerCase()}_before`,
            meta: { customerId, planId, campaignId: action.campaignId, criterionResourceName: rn, currentBidModifier: action.currentBidModifier, newBidModifier: mod, correlationId },
          });
          await mutateCampaignCriterionBidModifier(customerId, rn, mod);
          await supabase.from("growth_events").insert({
            type: `google_ads_optimizer_${action.type.toLowerCase()}_after`,
            meta: { customerId, planId, campaignId: action.campaignId, newBidModifier: mod, correlationId },
          });
          applied.push(`${action.type} campaign ${action.campaignId}`);
        } catch (e) {
          failed.push({ action: action.type, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }

  const runMeta = { applied, failed, skipped: guardrailResult.skipped.map((s) => s.reason) };
  const finalStatus = failed.length > 0 ? "failed" : "applied";

  await supabase.from("growth_ai_plans").update({ status: finalStatus }).eq("id", planId);
  await supabase.from("growth_ai_plan_runs").insert({
    plan_id: planId,
    correlation_id: correlationId,
    ok: failed.length === 0,
    meta: runMeta,
  });

  return {
    ok: failed.length === 0,
    meta: { planId, status: finalStatus, ...runMeta },
    error: failed.length > 0 ? failed.map((f) => `${f.action}: ${f.error}`).join("; ") : undefined,
  };
}

/**
 * Auto-apply job: find latest queued plan, check ads_auto_apply_mode, enqueue apply with mode filter.
 */
export async function handleGoogleAdsOptimizerAutoApply(
  _payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const autoApplyEnabled = await getGrowthSettingBoolean("ads_optimizer_auto_apply_enabled", true);
  if (!autoApplyEnabled) {
    return { ok: true, meta: { skipped: "ads_optimizer_auto_apply_enabled is false" } };
  }
  const customerId = await getCustomerId();
  const modeRaw = await getGrowthSetting("ads_auto_apply_mode");
  const mode = (["negatives_only", "budget_decrease_only", "low_risk", "full"].includes(String(modeRaw)) ? modeRaw : modeRaw === "all" ? "full" : "off") as "off" | "negatives_only" | "budget_decrease_only" | "low_risk" | "full";
  if (mode === "off") {
    return { ok: true, meta: { skipped: "auto_apply off" } };
  }
  const { data: planRow } = await supabase
    .from("growth_ai_plans")
    .select("id")
    .eq("product", PRODUCT)
    .eq("scope_ref", customerId)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!planRow?.id) {
    return { ok: true, meta: { skipped: "no queued plan" } };
  }
  const { jobId } = await enqueueJob(
    { type: "google_ads_apply_plan", payload: { planId: planRow.id, autoApplyMode: mode, onlyAutoApplyEligible: mode === "low_risk" } },
    supabase
  );
  return { ok: true, meta: { enqueuedApply: jobId, autoApplyMode: mode } };
}

const DIGEST_MAX_ATTEMPTS = 12;
const DIGEST_BACKOFF_MINUTES = 10;

/**
 * Daily digest job: wait for plan/apply to complete (self-requeue with backoff), then build summary and write snapshot.
 */
export async function handleGoogleAdsOptimizerDailyDigest(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const attempt = typeof payload.attempt === "number" && Number.isFinite(payload.attempt) ? payload.attempt : 0;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const { data: latestPlan } = await supabase
    .from("growth_ai_plans")
    .select("id, plan, status, created_at, updated_at")
    .eq("product", PRODUCT)
    .eq("scope_ref", customerId)
    .gte("created_at", todayIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planStillQueued = latestPlan?.status === "queued";
  if (planStillQueued && attempt < DIGEST_MAX_ATTEMPTS) {
    const runAfter = new Date();
    runAfter.setMinutes(runAfter.getMinutes() + DIGEST_BACKOFF_MINUTES);
    await enqueueJob(
      { type: "google_ads_optimizer_daily_digest", payload: { attempt: attempt + 1 }, runAfter },
      supabase
    );
    return { ok: true, meta: { requeued: true, attempt: attempt + 1, reason: "plan still queued" } };
  }

  const { data: latestPlanAny } = await supabase
    .from("growth_ai_plans")
    .select("id, plan, status, created_at, updated_at")
    .eq("product", PRODUCT)
    .eq("scope_ref", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planForSummary = latestPlanAny ?? latestPlan;

  const { data: recentRuns } = await supabase
    .from("growth_job_runs")
    .select("id, job_id, ok, meta, started_at")
    .gte("started_at", todayIso)
    .order("started_at", { ascending: false })
    .limit(50);

  const planSummary =
    planForSummary?.plan && typeof planForSummary.plan === "object"
      ? {
          planId: planForSummary.id,
          planVersion: (planForSummary.plan as { planVersion?: number }).planVersion,
          status: planForSummary.status,
          generatedAt: (planForSummary.plan as { generatedAt?: string }).generatedAt,
          actionsCount: Array.isArray((planForSummary.plan as { actions?: unknown[] }).actions)
            ? (planForSummary.plan as { actions: unknown[] }).actions.length
            : 0,
          riskFlags: (planForSummary.plan as { riskFlags?: string[] }).riskFlags ?? [],
        }
      : null;

  const digest = {
    date: todayIso.slice(0, 10),
    generatedAt: now.toISOString(),
    correlationId,
    customerId,
    latestPlan: planSummary,
    recentJobRunsCount: recentRuns?.length ?? 0,
    jobRuns: (recentRuns ?? []).map((r) => ({
      id: r.id,
      ok: r.ok,
      startedAt: r.started_at,
      meta: r.meta,
    })),
  };

  const { error } = await supabase.from("growth_google_snapshots").insert({
    product: PRODUCT,
    kind: "daily_digest",
    scope_ref: customerId,
    result: digest as unknown as Record<string, unknown>,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, meta: { digestDate: digest.date, planId: planSummary?.planId, attempt } };
}
