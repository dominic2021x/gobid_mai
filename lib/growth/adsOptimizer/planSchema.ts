import { z } from "zod";

const evidenceItem = z.object({
  term: z.string(),
  impressions: z.number().optional(),
  costMicros: z.number().optional(),
  conversions: z.number().optional(),
});

const actionAdjustBudget = z.object({
  type: z.literal("ADJUST_BUDGET"),
  campaignId: z.string(),
  currentBudgetMicros: z.number(),
  newBudgetMicros: z.number(),
  budgetResourceName: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionAddNegativeKeywords = z.object({
  type: z.literal("ADD_NEGATIVE_KEYWORDS"),
  campaignId: z.string().optional(),
  adGroupId: z.string().optional(),
  keywords: z.array(z.string()),
  matchType: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceItem).optional(),
  autoApplyEligible: z.boolean().optional(),
});

const actionPauseEntity = z.object({
  type: z.literal("PAUSE_ENTITY"),
  entityType: z.enum(["campaign", "ad_group"]),
  entityId: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionRefreshSnapshots = z.object({
  type: z.literal("REFRESH_SNAPSHOTS"),
  kinds: z.array(z.string()),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestLandingPageFix = z.object({
  type: z.literal("SUGGEST_LANDING_PAGE_FIX"),
  landingPage: z.string(),
  suggestedFix: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionAdjustTargetCpa = z.object({
  type: z.literal("ADJUST_TARGET_CPA"),
  campaignId: z.string(),
  currentTargetCpaMicros: z.number(),
  newTargetCpaMicros: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSuggestAdCopyImprovement = z.object({
  type: z.literal("SUGGEST_AD_COPY_IMPROVEMENT"),
  keywordId: z.string().optional(),
  adGroupId: z.string().optional(),
  campaignId: z.string().optional(),
  keywordText: z.string().optional(),
  qualityScore: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionPauseLowQsKeyword = z.object({
  type: z.literal("PAUSE_LOW_QS_KEYWORD"),
  criterionId: z.string(),
  adGroupId: z.string(),
  campaignId: z.string(),
  resourceName: z.string().optional(),
  qualityScore: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionAdjustAdSchedule = z.object({
  type: z.literal("ADJUST_AD_SCHEDULE"),
  campaignId: z.string(),
  criterionResourceName: z.string(),
  currentBidModifier: z.number(),
  newBidModifier: z.number(),
  dayOfWeek: z.string().optional(),
  startHour: z.number().optional(),
  endHour: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSetDeviceBidModifier = z.object({
  type: z.literal("SET_DEVICE_BID_MODIFIER"),
  campaignId: z.string(),
  criterionResourceName: z.string(),
  deviceType: z.string().optional(),
  currentBidModifier: z.number(),
  newBidModifier: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSetLocationBidModifier = z.object({
  type: z.literal("SET_LOCATION_BID_MODIFIER"),
  campaignId: z.string(),
  criterionResourceName: z.string(),
  geoTargetConstant: z.string().optional(),
  currentBidModifier: z.number(),
  newBidModifier: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSuggestDisableSearchPartners = z.object({
  type: z.literal("SUGGEST_DISABLE_SEARCH_PARTNERS"),
  campaignId: z.string(),
  campaignName: z.string().optional(),
  costMicros: z.number(),
  conversions: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionApplyDisableSearchPartners = z.object({
  type: z.literal("APPLY_DISABLE_SEARCH_PARTNERS"),
  campaignId: z.string(),
  campaignName: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionPauseKeyword = z.object({
  type: z.literal("PAUSE_KEYWORD"),
  criterionId: z.string(),
  adGroupId: z.string(),
  campaignId: z.string(),
  resourceName: z.string().optional(),
  keywordText: z.string().optional(),
  matchType: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSuggestQsImprovement = z.object({
  type: z.literal("SUGGEST_QS_IMPROVEMENT"),
  criterionId: z.string().optional(),
  adGroupId: z.string().optional(),
  campaignId: z.string().optional(),
  keywordText: z.string().optional(),
  qualityScore: z.number().optional(),
  searchRankLostImpressionShare: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionAdjustKeywordBidModifier = z.object({
  type: z.literal("ADJUST_KEYWORD_BID_MODIFIER"),
  criterionId: z.string(),
  adGroupId: z.string(),
  campaignId: z.string(),
  resourceName: z.string().optional(),
  keywordText: z.string().optional(),
  currentBidMicros: z.number(),
  newBidMicros: z.number(),
  intentScore: z.enum(["low", "neutral", "high"]).optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplyEligible: z.boolean().optional(),
});

const actionSuggestNegativeCrossMatch = z.object({
  type: z.literal("SUGGEST_NEGATIVE_CROSS_MATCH"),
  term: z.string(),
  adGroupIds: z.array(z.string()),
  campaignIds: z.array(z.string()),
  overlapCount: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestRestructureAdgroup = z.object({
  type: z.literal("SUGGEST_RESTRUCTURE_ADGROUP"),
  campaignId: z.string().optional(),
  adGroupIds: z.array(z.string()).optional(),
  broadTermCount: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestBiddingStrategyChange = z.object({
  type: z.literal("SUGGEST_BIDDING_STRATEGY_CHANGE"),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  currentStrategy: z.string(),
  conversions30d: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestSplitBrandCampaign = z.object({
  type: z.literal("SUGGEST_SPLIT_BRAND_CAMPAIGN"),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adGroupId: z.string().optional(),
  adGroupName: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestBrandNegativeProtection = z.object({
  type: z.literal("SUGGEST_BRAND_NEGATIVE_PROTECTION"),
  campaignId: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestSignalDensityFix = z.object({
  type: z.literal("SUGGEST_SIGNAL_DENSITY_FIX"),
  campaignId: z.string().optional(),
  conversions30d: z.number(),
  currentStrategy: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestLpRelevanceFix = z.object({
  type: z.literal("SUGGEST_LP_RELEVANCE_FIX"),
  keywordText: z.string().optional(),
  landingPage: z.string().optional(),
  ctr: z.number().optional(),
  conversionRate: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestBudgetConsolidation = z.object({
  type: z.literal("SUGGEST_BUDGET_CONSOLIDATION"),
  budgetConcentrationIndex: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestFunnelFix = z.object({
  type: z.literal("SUGGEST_FUNNEL_FIX"),
  stage: z.string(),
  dropPct: z.number(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestMicroConversionTracking = z.object({
  type: z.literal("SUGGEST_MICRO_CONVERSION_TRACKING"),
  finalConversions: z.number(),
  microEventCount: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestHighIntentCampaignSplit = z.object({
  type: z.literal("SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT"),
  campaignId: z.string().optional(),
  keywordCount: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestExactMatchExpansion = z.object({
  type: z.literal("SUGGEST_EXACT_MATCH_EXPANSION"),
  term: z.string().optional(),
  conversions: z.number().optional(),
  clicks: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestScaleWindow = z.object({
  type: z.literal("SUGGEST_SCALE_WINDOW"),
  campaignId: z.string().optional(),
  cpa7d: z.number().optional(),
  cpa14d: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestMarginalCpaReduction = z.object({
  type: z.literal("SUGGEST_MARGINAL_CPA_REDUCTION"),
  campaignId: z.string().optional(),
  elasticity: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const actionSuggestBudgetCap = z.object({
  type: z.literal("SUGGEST_BUDGET_CAP"),
  campaignId: z.string().optional(),
  marginalCpaMicros: z.number().optional(),
  averageCpaMicros: z.number().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const optimizerActionSchema = z.discriminatedUnion("type", [
  actionAdjustBudget,
  actionAddNegativeKeywords,
  actionPauseEntity,
  actionRefreshSnapshots,
  actionSuggestLandingPageFix,
  actionAdjustTargetCpa,
  actionSuggestAdCopyImprovement,
  actionPauseLowQsKeyword,
  actionAdjustAdSchedule,
  actionSetDeviceBidModifier,
  actionSetLocationBidModifier,
  actionSuggestDisableSearchPartners,
  actionApplyDisableSearchPartners,
  actionPauseKeyword,
  actionSuggestQsImprovement,
  actionAdjustKeywordBidModifier,
  actionSuggestNegativeCrossMatch,
  actionSuggestRestructureAdgroup,
  actionSuggestBiddingStrategyChange,
  actionSuggestSplitBrandCampaign,
  actionSuggestBrandNegativeProtection,
  actionSuggestSignalDensityFix,
  actionSuggestLpRelevanceFix,
  actionSuggestBudgetConsolidation,
  actionSuggestFunnelFix,
  actionSuggestMicroConversionTracking,
  actionSuggestHighIntentCampaignSplit,
  actionSuggestExactMatchExpansion,
  actionSuggestScaleWindow,
  actionSuggestMarginalCpaReduction,
  actionSuggestBudgetCap,
]);

export const optimizerPlanSchemaV1 = z.object({
  planVersion: z.literal(1),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV2 = z.object({
  planVersion: z.literal(2),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1),
  planType: z.enum(["full", "tracking_only"]),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV3 = z.object({
  planVersion: z.literal(3),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV4 = z.object({
  planVersion: z.literal(4),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV5 = z.object({
  planVersion: z.literal(5),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV6 = z.object({
  planVersion: z.literal(6),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const adsPrimaryObjectiveEnum = z.enum(["CPC_MIN", "CPA_MIN", "VOLUME_MAX", "ROAS_MAX"]);
export type AdsPrimaryObjective = z.infer<typeof adsPrimaryObjectiveEnum>;

export const optimizerPlanSchemaV7 = z.object({
  planVersion: z.literal(7),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  structuralMode: z.boolean().optional(),
  primaryObjective: adsPrimaryObjectiveEnum.optional(),
  clickQualityIndex: z.number().min(0).max(1).optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV8 = z.object({
  planVersion: z.literal(8),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  structuralMode: z.boolean().optional(),
  architectureMode: z.boolean().optional(),
  brandIsolationDetected: z.boolean().optional(),
  signalDensityScore: z.number().min(0).max(1).optional(),
  budgetConcentrationIndex: z.number().min(0).max(1).optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  primaryObjective: adsPrimaryObjectiveEnum.optional(),
  clickQualityIndex: z.number().min(0).max(1).optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const funnelMetricsSchema = z.object({
  sessions: z.number(),
  signups: z.number(),
  publishListing: z.number(),
  paidBoost: z.number().optional(),
  sessionToSignupPct: z.number().optional(),
  signupToPublishPct: z.number().optional(),
  publishToPaidPct: z.number().optional(),
});

export type FunnelMetrics = z.infer<typeof funnelMetricsSchema>;

export const optimizerPlanSchemaV9 = z.object({
  planVersion: z.literal(9),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  structuralMode: z.boolean().optional(),
  architectureMode: z.boolean().optional(),
  conversionSystemMode: z.boolean().optional(),
  brandIsolationDetected: z.boolean().optional(),
  signalDensityScore: z.number().min(0).max(1).optional(),
  budgetConcentrationIndex: z.number().min(0).max(1).optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  maxAffordableCpa: z.number().optional(),
  campaignIdsAboveProfitZone: z.array(z.string()).optional(),
  funnelMetrics: funnelMetricsSchema.optional(),
  primaryObjective: adsPrimaryObjectiveEnum.optional(),
  clickQualityIndex: z.number().min(0).max(1).optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const scalingSignalsSchema = z.object({
  scaleWindowCampaignIds: z.array(z.string()).optional(),
  elasticityAllowIncreaseCampaignIds: z.array(z.string()).optional(),
  elasticityScoreByCampaign: z.record(z.string(), z.number()).optional(),
});

export type ScalingSignals = z.infer<typeof scalingSignalsSchema>;

export const adsScalingRiskModeEnum = z.enum(["conservative", "balanced", "aggressive"]);
export type AdsScalingRiskMode = z.infer<typeof adsScalingRiskModeEnum>;

export const optimizerPlanSchemaV10 = z.object({
  planVersion: z.literal(10),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  structuralMode: z.boolean().optional(),
  architectureMode: z.boolean().optional(),
  conversionSystemMode: z.boolean().optional(),
  economicMode: z.boolean().optional(),
  brandIsolationDetected: z.boolean().optional(),
  signalDensityScore: z.number().min(0).max(1).optional(),
  budgetConcentrationIndex: z.number().min(0).max(1).optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  maxSustainableCpa: z.number().optional(),
  maxAffordableCpa: z.number().optional(),
  campaignIdsAboveProfitZone: z.array(z.string()).optional(),
  elasticityScore: z.number().optional(),
  scalingSignals: scalingSignalsSchema.optional(),
  funnelMetrics: funnelMetricsSchema.optional(),
  primaryObjective: adsPrimaryObjectiveEnum.optional(),
  clickQualityIndex: z.number().min(0).max(1).optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchemaV10_1 = z.object({
  planVersion: z.literal(10.1),
  customerId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  conversionReadinessScore: z.number().min(0).max(1).optional(),
  planType: z.enum(["full", "tracking_only"]).optional(),
  statisticalConfidenceLevel: z.enum(["low", "medium", "high"]),
  deterministicActionsCount: z.number().int().min(0),
  biddingStrategyAware: z.boolean(),
  cpcReductionMode: z.boolean().optional(),
  trafficQualityMode: z.boolean().optional(),
  intentMode: z.boolean().optional(),
  auctionAware: z.boolean().optional(),
  structuralMode: z.boolean().optional(),
  architectureMode: z.boolean().optional(),
  conversionSystemMode: z.boolean().optional(),
  economicMode: z.boolean().optional(),
  stabilityMode: z.boolean().optional(),
  brandIsolationDetected: z.boolean().optional(),
  signalDensityScore: z.number().min(0).max(1).optional(),
  budgetConcentrationIndex: z.number().min(0).max(1).optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  maxSustainableCpa: z.number().optional(),
  maxAffordableCpa: z.number().optional(),
  campaignIdsAboveProfitZone: z.array(z.string()).optional(),
  elasticityScore: z.number().optional(),
  scalingSignals: scalingSignalsSchema.optional(),
  capitalProtectionActive: z.boolean().optional(),
  coolingPeriodActive: z.boolean().optional(),
  funnelMetrics: funnelMetricsSchema.optional(),
  primaryObjective: adsPrimaryObjectiveEnum.optional(),
  clickQualityIndex: z.number().min(0).max(1).optional(),
  effectiveTargetCpcMicros: z.number().optional(),
  actions: z.array(optimizerActionSchema),
  riskFlags: z.array(z.string()),
});

export const optimizerPlanSchema = z.union([
  optimizerPlanSchemaV1,
  optimizerPlanSchemaV2,
  optimizerPlanSchemaV3,
  optimizerPlanSchemaV4,
  optimizerPlanSchemaV5,
  optimizerPlanSchemaV6,
  optimizerPlanSchemaV7,
  optimizerPlanSchemaV8,
  optimizerPlanSchemaV9,
  optimizerPlanSchemaV10,
  optimizerPlanSchemaV10_1,
]);

export type OptimizerPlan = z.infer<typeof optimizerPlanSchema>;
export type OptimizerAction = z.infer<typeof optimizerActionSchema>;
export type OptimizerPlanV2 = z.infer<typeof optimizerPlanSchemaV2>;
export type OptimizerPlanV3 = z.infer<typeof optimizerPlanSchemaV3>;
export type OptimizerPlanV4 = z.infer<typeof optimizerPlanSchemaV4>;
export type OptimizerPlanV5 = z.infer<typeof optimizerPlanSchemaV5>;
export type OptimizerPlanV6 = z.infer<typeof optimizerPlanSchemaV6>;
export type OptimizerPlanV7 = z.infer<typeof optimizerPlanSchemaV7>;
export type OptimizerPlanV8 = z.infer<typeof optimizerPlanSchemaV8>;
export type OptimizerPlanV9 = z.infer<typeof optimizerPlanSchemaV9>;
export type OptimizerPlanV10 = z.infer<typeof optimizerPlanSchemaV10>;
export type OptimizerPlanV10_1 = z.infer<typeof optimizerPlanSchemaV10_1>;
