/**
 * Build ranking features for one suggestion candidate.
 * Pure functions; no DB. Stats (impressions, clicks) passed in when available.
 */

import type { SuggestionCandidate, SuggestionFeatures, RankingContext } from "./types";
import {
  RECENCY_HALF_DAYS,
  PHRASE_LENGTH_PENALTY_THRESHOLD,
  PHRASE_LENGTH_PENALTY_MAX,
  EXPLORATION_IMPRESSION_THRESHOLD,
  DEFAULT_CTR,
  MIN_IMPRESSIONS_FOR_BEHAVIOR_PENALTY,
  ZERO_CLICK_PENALTY,
  LOW_CTR_THRESHOLD,
  LOW_CTR_PENALTY,
} from "./constants";

function lexicalRelevance(queryNorm: string, phraseNorm: string): number {
  if (!queryNorm || !phraseNorm) return 0;
  const q = queryNorm.trim().toLowerCase();
  const p = phraseNorm.trim().toLowerCase();
  if (q === p) return 1;
  if (p.startsWith(q)) return 0.5 + (0.5 * q.length) / Math.max(p.length, 1);
  if (p.includes(q)) return 0.3;
  return 0;
}

function phraseLengthPenalty(phraseNorm: string): number {
  const tokens = phraseNorm.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= PHRASE_LENGTH_PENALTY_THRESHOLD) return 1;
  const over = tokens.length - PHRASE_LENGTH_PENALTY_THRESHOLD;
  return Math.max(PHRASE_LENGTH_PENALTY_MAX, 1 - over * 0.1);
}

function recencyScore(lastSeenAt: string | null): number {
  if (!lastSeenAt) return 0.2;
  const days = (Date.now() - new Date(lastSeenAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.exp(-(days * Math.LN2) / RECENCY_HALF_DAYS);
}

export function buildSuggestionFeatures(
  candidate: SuggestionCandidate,
  context: RankingContext,
  stats?: { impressions: number; clicks: number } | null,
  patternQuality: number = 0.5,
  queryStats?: { impressions: number; clicks: number } | null
): SuggestionFeatures {
  const queryNorm = context.query_norm.trim().toLowerCase();
  const lexical = lexicalRelevance(queryNorm, candidate.phrase_norm);
  const impressions = stats?.impressions ?? 0;
  const clicks = stats?.clicks ?? 0;
  const ctr = impressions > 0 ? clicks / impressions : DEFAULT_CTR;
  const queryAffinity =
    queryStats && queryStats.impressions > 0
      ? Math.min(1, (queryStats.clicks / queryStats.impressions) * 2)
      : 0.5;
  let qualityPenalty = 1;
  if (impressions >= MIN_IMPRESSIONS_FOR_BEHAVIOR_PENALTY) {
    if (clicks === 0) qualityPenalty = ZERO_CLICK_PENALTY;
    else if (ctr < LOW_CTR_THRESHOLD) qualityPenalty = LOW_CTR_PENALTY;
  }
  const explorationBoost =
    impressions < EXPLORATION_IMPRESSION_THRESHOLD && impressions >= 0
      ? 1 - impressions / EXPLORATION_IMPRESSION_THRESHOLD
      : 0;

  let contextBoost = 0;
  if (context.category && candidate.category_key && context.category === candidate.category_key) {
    contextBoost += 0.8;
  }
  if (context.channel && candidate.channel && context.channel === candidate.channel) {
    contextBoost += 0.5;
  }
  if (context.subcategory && candidate.meta?.subcategory === context.subcategory) {
    contextBoost += 0.3;
  }

  return {
    lexical_relevance: lexical,
    phrase_length_penalty: phraseLengthPenalty(candidate.phrase_norm),
    source_priority: Math.min(10, Math.max(0, candidate.source_priority)),
    frequency_count: candidate.frequency_count,
    recency: recencyScore(candidate.last_seen_at),
    ctr,
    quality_score: Math.min(1, Math.max(0, candidate.quality_score)),
    context_boost: Math.min(1, contextBoost),
    quality_penalty: qualityPenalty,
    exploration_boost: explorationBoost,
    impressions,
    pattern_quality: Math.min(1, Math.max(0, patternQuality)),
    query_affinity: Math.min(1, Math.max(0, queryAffinity)),
  };
}
