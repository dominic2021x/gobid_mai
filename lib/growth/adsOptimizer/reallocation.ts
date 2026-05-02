import "server-only";

export interface CampaignStatForReallocation {
  campaignId: string;
  conversions: number;
  costMicros: number;
  amountMicros: number;
  budgetResourceName: string;
}

export interface ReallocationSettings {
  minConversionsForBudgetIncrease: number;
  maxBudgetChangePct: number;
  allowTotalBudgetIncrease?: boolean;
  /** When set, only campaigns in this set receive budget increase (IS low + conv good). */
  allowIncreaseCampaignIds?: Set<string>;
  /** When set, campaigns in this set are prioritized for reduction (IS high + conv rate low). */
  reduceCampaignIds?: Set<string>;
  /** When set, campaigns in this set never receive budget increase (e.g. CPA above profit zone). */
  blockBudgetIncreaseCampaignIds?: Set<string>;
}

export interface AdjustBudgetAction {
  type: "ADJUST_BUDGET";
  campaignId: string;
  currentBudgetMicros: number;
  newBudgetMicros: number;
  budgetResourceName?: string;
  reason: string;
  confidence: number;
  autoApplyEligible?: boolean;
}

/**
 * Deterministic budget reallocation: reduce losers, pool freed budget, redistribute to winners by conversion volume.
 * NEVER increase total account budget unless allowTotalBudgetIncrease is true.
 */
export function computeBudgetReallocation(
  campaignStats: CampaignStatForReallocation[],
  settings: ReallocationSettings
): AdjustBudgetAction[] {
  const actions: AdjustBudgetAction[] = [];
  const totalConversions = campaignStats.reduce((s, c) => s + c.conversions, 0);
  const totalCost = campaignStats.reduce((s, c) => s + c.costMicros, 0);
  const accountAverageCPA = totalConversions > 0 ? totalCost / totalConversions : 0;

  const minConv = settings.minConversionsForBudgetIncrease;
  const maxPct = settings.maxBudgetChangePct;
  const maxRatio = 1 - maxPct / 100;
  const allowIncreaseIds = settings.allowIncreaseCampaignIds;
  const reduceIds = settings.reduceCampaignIds;
  const blockIncreaseIds = settings.blockBudgetIncreaseCampaignIds;

  let winners = campaignStats.filter(
    (c) =>
      c.conversions >= minConv &&
      c.amountMicros > 0 &&
      (c.conversions === 0 ? false : c.costMicros / c.conversions <= accountAverageCPA)
  );
  if (blockIncreaseIds && blockIncreaseIds.size > 0) {
    winners = winners.filter((c) => !blockIncreaseIds.has(c.campaignId));
  }
  if (allowIncreaseIds && allowIncreaseIds.size > 0) {
    winners = winners.filter((c) => allowIncreaseIds.has(c.campaignId));
  }

  let losers = campaignStats.filter(
    (c) =>
      c.amountMicros > 0 &&
      (c.conversions === 0 || (accountAverageCPA > 0 && c.costMicros / c.conversions > accountAverageCPA * 1.5))
  );
  if (reduceIds && reduceIds.size > 0) {
    const inReduce = losers.filter((c) => reduceIds.has(c.campaignId));
    const notInReduce = losers.filter((c) => !reduceIds.has(c.campaignId));
    losers = [...inReduce, ...notInReduce];
  }

  let pooledMicros = 0;
  for (const c of losers) {
    const reduction = Math.round(c.amountMicros * (1 - maxRatio));
    if (reduction <= 0) continue;
    const newBudget = Math.max(0, c.amountMicros - reduction);
    pooledMicros += c.amountMicros - newBudget;
    actions.push({
      type: "ADJUST_BUDGET",
      campaignId: c.campaignId,
      currentBudgetMicros: c.amountMicros,
      newBudgetMicros: newBudget,
      budgetResourceName: c.budgetResourceName,
      reason: "Deterministic reallocation: reduce underperformer",
      confidence: 1,
      autoApplyEligible: true,
    });
  }

  if (pooledMicros <= 0 || winners.length === 0) return actions;

  const totalWinnerConversions = winners.reduce((s, c) => s + c.conversions, 0);
  if (totalWinnerConversions <= 0) return actions;

  for (const c of winners) {
    const share = c.conversions / totalWinnerConversions;
    const addMicros = Math.round(pooledMicros * share);
    if (addMicros <= 0) continue;
    const newBudget = c.amountMicros + addMicros;
    const increasePct = (newBudget - c.amountMicros) / c.amountMicros;
    const clampedPct = Math.min(increasePct, maxPct / 100);
    const actualAdd = Math.round(c.amountMicros * clampedPct);
    const finalNew = c.amountMicros + actualAdd;
    if (finalNew <= c.amountMicros) continue;
    actions.push({
      type: "ADJUST_BUDGET",
      campaignId: c.campaignId,
      currentBudgetMicros: c.amountMicros,
      newBudgetMicros: finalNew,
      budgetResourceName: c.budgetResourceName,
      reason: "Deterministic reallocation: shift to winner by conversion share",
      confidence: 1,
      autoApplyEligible: true,
    });
  }

  return actions;
}
