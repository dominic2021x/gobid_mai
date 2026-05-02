/**
 * Filter suggestion candidates using pattern engine + quality rules.
 * Removes weak endings, incomplete phrases, invalid combinations; respects blacklist/whitelist.
 */

import type { PatternProfile, PatternMatchResult } from "../types";
import { matchPatternProfile } from "../matchPatternProfile";
import { scorePatternQuality } from "../scorePatternQuality";
import type { MarketplaceTaxonomy } from "../types";
import { isWhitelistedPhrase } from "./whitelists";
import { getDefaultInvalidPhraseTokens } from "./blacklists";
import { normalizePatternInput } from "../normalizePatternInput";

export type PatternFilterInput = {
  phrase_norm: string;
  [key: string]: unknown;
};

export type PatternFilterResult = {
  keep: boolean;
  patternMatch: PatternMatchResult;
  patternQualityScore: number;
  reason?: string;
};

/**
 * Filter one candidate: apply blacklist, whitelist, invalid tokens, then pattern match.
 */
export function filterPatternCandidate(
  candidate: PatternFilterInput,
  opts: {
    taxonomy: MarketplaceTaxonomy;
    profile: PatternProfile;
    blacklist?: Set<string>;
    whitelist?: Set<string>;
  }
): PatternFilterResult {
  const phraseNorm = (candidate.phrase_norm ?? "").trim().toLowerCase();
  if (!phraseNorm || phraseNorm.length < 2) {
    const match: PatternMatchResult = {
      patternType: "invalid",
      confidence: 0,
      vertical: null,
      segments: {},
      invalid: true,
    };
    return {
      keep: false,
      patternMatch: match,
      patternQualityScore: 0,
      reason: "phrase_too_short",
    };
  }

  if (opts.blacklist?.has(phraseNorm)) {
    const match = matchPatternProfile(phraseNorm, {
      taxonomy: opts.taxonomy,
      profile: opts.profile,
    });
    return {
      keep: false,
      patternMatch: match,
      patternQualityScore: 0,
      reason: "blacklisted",
    };
  }

  if (isWhitelistedPhrase(phraseNorm, opts.whitelist)) {
    const match = matchPatternProfile(phraseNorm, {
      taxonomy: opts.taxonomy,
      profile: opts.profile,
    });
    const score = scorePatternQuality(match, opts.profile);
    return {
      keep: true,
      patternMatch: match,
      patternQualityScore: Math.max(score, 0.7),
      reason: "whitelisted",
    };
  }

  const invalidTokens = getDefaultInvalidPhraseTokens();
  const { tokens } = normalizePatternInput(phraseNorm);
  if (tokens.some((t) => invalidTokens.has(t))) {
    const match = matchPatternProfile(phraseNorm, {
      taxonomy: opts.taxonomy,
      profile: opts.profile,
    });
    return {
      keep: false,
      patternMatch: match,
      patternQualityScore: 0,
      reason: "invalid_token",
    };
  }

  const last = tokens[tokens.length - 1];
  if (last && opts.profile.weakLastTokens.has(last)) {
    const match = matchPatternProfile(phraseNorm, {
      taxonomy: opts.taxonomy,
      profile: opts.profile,
    });
    if (match.confidence < 0.8) {
      return {
        keep: false,
        patternMatch: match,
        patternQualityScore: 0,
        reason: "weak_last_token",
      };
    }
  }

  const match = matchPatternProfile(phraseNorm, {
    taxonomy: opts.taxonomy,
    profile: opts.profile,
  });
  const patternQualityScore = scorePatternQuality(match, opts.profile);

  if (match.invalid) {
    return {
      keep: false,
      patternMatch: match,
      patternQualityScore: 0,
      reason: "invalid_pattern",
    };
  }

  if (patternQualityScore < opts.profile.minPatternScore) {
    return {
      keep: false,
      patternMatch: match,
      patternQualityScore,
      reason: "low_pattern_score",
    };
  }

  return {
    keep: true,
    patternMatch: match,
    patternQualityScore,
  };
}
