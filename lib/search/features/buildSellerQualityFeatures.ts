/**
 * Seller quality features: completeness, trust, response rate, stale penalty.
 */

import type { SellerQualityFeatures } from "../ranking/core/types";

export interface SellerSignals {
  profile_completeness?: number;
  trust_score?: number;
  response_rate?: number;
  last_active_at?: string | null;
}

const STALE_DAYS = 180;

export function buildSellerQualityFeatures(signals: SellerSignals | null): SellerQualityFeatures {
  if (!signals) {
    return {
      completeness: 0.5,
      trustScore: 0.5,
      responseRate: 0.5,
      stalePenalty: 1,
    };
  }

  const completeness = Math.min(1, Math.max(0, signals.profile_completeness ?? 0.5));
  const trustScore = Math.min(1, Math.max(0, signals.trust_score ?? 0.5));
  const responseRate = Math.min(1, Math.max(0, signals.response_rate ?? 0.5));

  let stalePenalty = 1;
  const lastActive = signals.last_active_at;
  if (lastActive) {
    const days = (Date.now() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000);
    if (days > STALE_DAYS) stalePenalty = Math.max(0.5, 1 - (days - STALE_DAYS) / 365);
  }

  return {
    completeness,
    trustScore,
    responseRate,
    stalePenalty,
  };
}
