import "server-only";
import type { OptimizerPlan, OptimizerAction } from "./planSchema";

export type AutoApplyMode = "off" | "negatives_only" | "budget_decrease_only" | "low_risk" | "full";

export interface GuardrailSettings {
  maxBudgetChangePct: number;
  maxActionsPerDay: number;
  allowPause: boolean;
  allowNegatives: boolean;
  minDaysBetweenChanges: number;
  minConversionsForBudgetIncrease: number;
  capSpendPerDayMicros: number;
  minReadinessForFullPlan: number;
  autoApplyMode: AutoApplyMode;
  maxTargetCpaChangePct?: number;
  allowPauseLowQsKeyword?: boolean;
  maxBidModifierChangePct?: number;
  allowDisableSearchPartners?: boolean;
  allowPauseKeyword?: boolean;
}

export interface GuardrailResult {
  allowed: OptimizerAction[];
  skipped: Array<{ action: OptimizerAction; reason: string }>;
  errors: string[];
  autoApplyAllowed?: OptimizerAction[];
  riskFlags?: string[];
}

/** Campaign stats from report snapshot for guardrail checks. */
export interface CampaignStats {
  conversions: number;
  costMicros: number;
  targetCpaMicros?: number;
}

/**
 * Clamp newBudgetMicros so that change vs currentBudgetMicros does not exceed maxBudgetChangePct.
 */
function clampBudgetChange(
  currentMicros: number,
  newMicros: number,
  maxPct: number
): number {
  if (currentMicros <= 0) return newMicros;
  const maxRatio = 1 + maxPct / 100;
  const minRatio = 1 - maxPct / 100;
  const ratio = newMicros / currentMicros;
  if (ratio > maxRatio) return Math.round(currentMicros * maxRatio);
  if (ratio < minRatio) return Math.round(currentMicros * minRatio);
  return newMicros;
}

export type StatisticalConfidenceLevel = "low" | "medium" | "high";

/**
 * Validate plan actions against guardrails. Returns allowed actions and skip reasons.
 * If campaignStats is provided, budget increases are skipped when conversions < minConversionsForBudgetIncrease.
 * If confidenceLevel === "low", block all ADJUST_BUDGET increases and add risk flag.
 */
export function validatePlanGuardrails(
  plan: OptimizerPlan,
  settings: GuardrailSettings,
  maxActions: number,
  campaignStats?: Map<string, CampaignStats>,
  confidenceLevel?: StatisticalConfidenceLevel
): GuardrailResult {
  const allowed: OptimizerAction[] = [];
  const skipped: Array<{ action: OptimizerAction; reason: string }> = [];
  const errors: string[] = [];
  const autoApplyAllowed: OptimizerAction[] = [];
  const riskFlags = "riskFlags" in plan && Array.isArray(plan.riskFlags) ? [...plan.riskFlags] : [];
  if (confidenceLevel === "low") {
    riskFlags.push("LOW_STATISTICAL_CONFIDENCE");
  }

  const mutateActionTypes = ["ADJUST_BUDGET", "ADD_NEGATIVE_KEYWORDS", "PAUSE_ENTITY", "ADJUST_TARGET_CPA", "PAUSE_LOW_QS_KEYWORD", "ADJUST_AD_SCHEDULE", "SET_DEVICE_BID_MODIFIER", "SET_LOCATION_BID_MODIFIER", "APPLY_DISABLE_SEARCH_PARTNERS", "PAUSE_KEYWORD", "ADJUST_KEYWORD_BID_MODIFIER"] as const;
  const readOnlyActionTypes = ["SUGGEST_AD_COPY_IMPROVEMENT", "SUGGEST_DISABLE_SEARCH_PARTNERS", "SUGGEST_QS_IMPROVEMENT", "SUGGEST_NEGATIVE_CROSS_MATCH", "SUGGEST_RESTRUCTURE_ADGROUP", "SUGGEST_BIDDING_STRATEGY_CHANGE", "SUGGEST_SPLIT_BRAND_CAMPAIGN", "SUGGEST_BRAND_NEGATIVE_PROTECTION", "SUGGEST_SIGNAL_DENSITY_FIX", "SUGGEST_LP_RELEVANCE_FIX", "SUGGEST_BUDGET_CONSOLIDATION", "SUGGEST_FUNNEL_FIX", "SUGGEST_MICRO_CONVERSION_TRACKING", "SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT", "SUGGEST_EXACT_MATCH_EXPANSION", "SUGGEST_SCALE_WINDOW", "SUGGEST_MARGINAL_CPA_REDUCTION", "SUGGEST_BUDGET_CAP"] as const;
  let mutateCount = 0;
  const maxTargetCpaPct = settings.maxTargetCpaChangePct ?? 15;
  const maxBidModifierPct = settings.maxBidModifierChangePct ?? 20;
  const conversionLagBlock = riskFlags.includes("CONVERSION_LAG");

  for (const action of plan.actions) {
    if (action.type === "REFRESH_SNAPSHOTS" || action.type === "SUGGEST_LANDING_PAGE_FIX" || action.type === "SUGGEST_AD_COPY_IMPROVEMENT" || action.type === "SUGGEST_DISABLE_SEARCH_PARTNERS" || action.type === "SUGGEST_QS_IMPROVEMENT" || action.type === "SUGGEST_NEGATIVE_CROSS_MATCH" || action.type === "SUGGEST_RESTRUCTURE_ADGROUP" || action.type === "SUGGEST_BIDDING_STRATEGY_CHANGE" || action.type === "SUGGEST_SPLIT_BRAND_CAMPAIGN" || action.type === "SUGGEST_BRAND_NEGATIVE_PROTECTION" || action.type === "SUGGEST_SIGNAL_DENSITY_FIX" || action.type === "SUGGEST_LP_RELEVANCE_FIX" || action.type === "SUGGEST_BUDGET_CONSOLIDATION" || action.type === "SUGGEST_FUNNEL_FIX" || action.type === "SUGGEST_MICRO_CONVERSION_TRACKING" || action.type === "SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT" || action.type === "SUGGEST_EXACT_MATCH_EXPANSION" || action.type === "SUGGEST_SCALE_WINDOW" || action.type === "SUGGEST_MARGINAL_CPA_REDUCTION" || action.type === "SUGGEST_BUDGET_CAP") {
      allowed.push(action);
      continue;
    }

    if (conversionLagBlock && (action.type === "PAUSE_ENTITY" || action.type === "PAUSE_KEYWORD" || action.type === "PAUSE_LOW_QS_KEYWORD")) {
      skipped.push({ action, reason: "CONVERSION_LAG: pause blocked" });
      continue;
    }
    if (conversionLagBlock && action.type === "ADJUST_BUDGET" && action.newBudgetMicros < action.currentBudgetMicros) {
      skipped.push({ action, reason: "CONVERSION_LAG: budget decrease blocked" });
      continue;
    }

    if (action.type === "APPLY_DISABLE_SEARCH_PARTNERS" && !settings.allowDisableSearchPartners) {
      skipped.push({ action, reason: "APPLY_DISABLE_SEARCH_PARTNERS disabled by guardrail (ads_allow_disable_search_partners=false)" });
      continue;
    }

    if (action.type === "PAUSE_KEYWORD" && !settings.allowPauseKeyword) {
      skipped.push({ action, reason: "PAUSE_KEYWORD disabled by guardrail (ads_allow_pause_keyword=false)" });
      continue;
    }

    if (action.type === "ADJUST_KEYWORD_BID_MODIFIER") {
      const current = action.currentBidMicros;
      const requested = action.newBidMicros;
      if (current <= 0) {
        skipped.push({ action, reason: "ADJUST_KEYWORD_BID_MODIFIER: invalid current bid" });
        continue;
      }
      const maxRatio = 1 + maxBidModifierPct / 100;
      const minRatio = 1 - maxBidModifierPct / 100;
      const clamped = Math.round(
        Math.max(current * minRatio, Math.min(current * maxRatio, requested))
      );
      if (clamped !== requested) {
        allowed.push({ ...action, newBidMicros: clamped });
        skipped.push({ action, reason: `Keyword bid modifier clamped to ±${maxBidModifierPct}%` });
        mutateCount++;
        if (action.autoApplyEligible) autoApplyAllowed.push({ ...action, newBidMicros: clamped });
        continue;
      }
    }

    if (!mutateActionTypes.includes(action.type as (typeof mutateActionTypes)[number])) {
      skipped.push({ action, reason: "Unknown action type" });
      continue;
    }

    if (action.type === "PAUSE_LOW_QS_KEYWORD" && !settings.allowPauseLowQsKeyword) {
      skipped.push({ action, reason: "PAUSE_LOW_QS_KEYWORD disabled by guardrail (ads_allow_pause_low_qs_keyword=false)" });
      continue;
    }

    if (action.type === "ADJUST_AD_SCHEDULE" || action.type === "SET_DEVICE_BID_MODIFIER" || action.type === "SET_LOCATION_BID_MODIFIER") {
      const current = action.currentBidModifier ?? 1;
      const requested = action.newBidModifier ?? current;
      const maxRatio = 1 + maxBidModifierPct / 100;
      const minRatio = 1 - maxBidModifierPct / 100;
      const ratio = current > 0 ? requested / current : 1;
      const clamped = ratio > maxRatio ? Math.round(current * maxRatio * 100) / 100 : ratio < minRatio ? Math.round(current * minRatio * 100) / 100 : requested;
      const clampedVal = Math.max(0.01, Math.min(10, clamped));
      if (clampedVal !== requested) {
        allowed.push({ ...action, newBidModifier: clampedVal });
        skipped.push({ action, reason: `Bid modifier clamped to ±${maxBidModifierPct}%` });
        mutateCount++;
        if (action.autoApplyEligible) autoApplyAllowed.push({ ...action, newBidModifier: clampedVal });
        continue;
      }
    }

    if (action.type === "ADJUST_BUDGET" && confidenceLevel === "low" && action.newBudgetMicros > action.currentBudgetMicros) {
      skipped.push({ action, reason: "Budget increase blocked: LOW_STATISTICAL_CONFIDENCE" });
      continue;
    }
    const campaignIdsAboveProfitZone = (plan as { campaignIdsAboveProfitZone?: string[] }).campaignIdsAboveProfitZone;
    if (action.type === "ADJUST_BUDGET" && action.newBudgetMicros > action.currentBudgetMicros && Array.isArray(campaignIdsAboveProfitZone) && campaignIdsAboveProfitZone.includes(action.campaignId)) {
      skipped.push({ action, reason: "Budget increase blocked: CPA_ABOVE_PROFIT_ZONE" });
      continue;
    }

    if (action.type === "ADJUST_TARGET_CPA") {
      const current = action.currentTargetCpaMicros;
      const requested = action.newTargetCpaMicros;
      if (current <= 0) {
        skipped.push({ action, reason: "ADJUST_TARGET_CPA: invalid current target CPA" });
        continue;
      }
      const ratio = requested / current;
      const maxRatio = 1 + maxTargetCpaPct / 100;
      const minRatio = 1 - maxTargetCpaPct / 100;
      const clamped = ratio > maxRatio ? Math.round(current * maxRatio) : ratio < minRatio ? Math.round(current * minRatio) : requested;
      if (clamped !== requested) {
        allowed.push({ ...action, newTargetCpaMicros: clamped });
        skipped.push({ action, reason: `Target CPA change clamped to ±${maxTargetCpaPct}%` });
        mutateCount++;
        if (action.autoApplyEligible) autoApplyAllowed.push({ ...action, newTargetCpaMicros: clamped });
        continue;
      }
    }

    if (action.type === "PAUSE_ENTITY" && !settings.allowPause) {
      skipped.push({ action, reason: "Pause disabled by guardrail (ads_allow_pause=false)" });
      continue;
    }
    if (action.type === "ADD_NEGATIVE_KEYWORDS" && !settings.allowNegatives) {
      skipped.push({ action, reason: "Negatives disabled by guardrail (ads_allow_negatives=false)" });
      continue;
    }

    if (action.type === "ADJUST_BUDGET") {
      const current = action.currentBudgetMicros;
      let requested = action.newBudgetMicros;

      if (requested > current) {
        if (campaignStats && action.campaignId) {
          const stats = campaignStats.get(action.campaignId);
          const conv = stats?.conversions ?? 0;
          if (conv < settings.minConversionsForBudgetIncrease) {
            skipped.push({
              action,
              reason: `Budget increase skipped: campaign has ${conv} conversions (min ${settings.minConversionsForBudgetIncrease} required)`,
            });
            continue;
          }
        }
        if (settings.capSpendPerDayMicros > 0 && requested > settings.capSpendPerDayMicros) {
          requested = settings.capSpendPerDayMicros;
        }
      }

      const clamped = clampBudgetChange(current, requested, settings.maxBudgetChangePct);
      if (settings.capSpendPerDayMicros > 0 && clamped > settings.capSpendPerDayMicros) {
        const capped = Math.min(clamped, settings.capSpendPerDayMicros);
        allowed.push({ ...action, newBudgetMicros: capped });
        skipped.push({
          action,
          reason: `Budget capped to ${settings.capSpendPerDayMicros} micros/day (requested ${clamped})`,
        });
        mutateCount++;
        if (action.autoApplyEligible) autoApplyAllowed.push({ ...action, newBudgetMicros: capped });
        continue;
      }
      if (clamped !== action.newBudgetMicros) {
        allowed.push({ ...action, newBudgetMicros: clamped });
        skipped.push({
          action,
          reason: `Budget change clamped to ±${settings.maxBudgetChangePct}% (requested ${action.newBudgetMicros}, will apply ${clamped})`,
        });
        mutateCount++;
        if (action.autoApplyEligible) autoApplyAllowed.push({ ...action, newBudgetMicros: clamped });
        continue;
      }
    }

    if (mutateCount >= maxActions) {
      skipped.push({ action, reason: `Max actions per run (${maxActions}) reached` });
      continue;
    }
    mutateCount++;
    allowed.push(action);
    if ("autoApplyEligible" in action && action.autoApplyEligible === true) {
      autoApplyAllowed.push(action);
    }
  }

  return { allowed, skipped, errors, autoApplyAllowed, riskFlags: riskFlags.length ? riskFlags : undefined };
}
