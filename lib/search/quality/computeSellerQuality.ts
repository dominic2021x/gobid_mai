/**
 * Compute seller quality signals (for offline job).
 * Used to populate seller_quality_signals table.
 */

import { buildSellerQualityFeatures, type SellerSignals } from "../features/buildSellerQualityFeatures";

export interface SellerQualitySignalsRow {
  seller_id: string;
  channel: string;
  profile_completeness: number;
  trust_score: number;
  response_rate: number | null;
  last_active_at: string | null;
}

/**
 * Compute quality row from raw signals.
 */
export function computeSellerQualitySignals(
  sellerId: string,
  channel: string,
  signals: SellerSignals | null
): SellerQualitySignalsRow {
  const f = buildSellerQualityFeatures(signals);
  return {
    seller_id: sellerId,
    channel,
    profile_completeness: Math.round(f.completeness * 10000) / 10000,
    trust_score: Math.round(f.trustScore * 10000) / 10000,
    response_rate: signals?.response_rate != null ? Math.round(signals.response_rate * 10000) / 10000 : null,
    last_active_at: signals?.last_active_at ?? null,
  };
}
