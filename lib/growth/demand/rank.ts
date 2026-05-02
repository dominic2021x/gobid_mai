/**
 * Compute demand score from multiple signals (internal count, GSC impressions, etc.).
 * Higher = more demand opportunity.
 */

export interface DemandSignals {
  internalCount: number;
  gscImpressions: number;
  gscClicks: number;
  suggestionPopularity?: number;
}

const WEIGHT_INTERNAL = 2;
const WEIGHT_GSC_IMPR = 1;
const WEIGHT_GSC_CLICKS = 3;
const WEIGHT_SUGGESTION = 0.5;

export function computeDemandScore(signals: DemandSignals): number {
  const internal = Math.min(signals.internalCount, 500) * WEIGHT_INTERNAL;
  const gscImp = Math.min(signals.gscImpressions, 10000) * WEIGHT_GSC_IMPR;
  const gscClk = Math.min(signals.gscClicks, 500) * WEIGHT_GSC_CLICKS;
  const suggest = Math.min(signals.suggestionPopularity ?? 0, 200) * WEIGHT_SUGGESTION;
  return Math.round((internal + gscImp + gscClk + suggest) * 100) / 100;
}
