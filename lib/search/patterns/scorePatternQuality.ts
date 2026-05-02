/**
 * Score pattern quality for ranking (0..1).
 * Used as a first-class signal in suggestion ranking.
 */

import type { PatternMatchResult, PatternProfile } from "./types";
import { PREFERRED_PATTERN_BOOST, INVALID_PATTERN_PENALTY } from "./constants";

/**
 * Single scalar pattern quality score (0..1).
 * Invalid patterns get 0; preferred types get a boost.
 */
export function scorePatternQuality(
  match: PatternMatchResult,
  profile: PatternProfile
): number {
  if (match.invalid) return INVALID_PATTERN_PENALTY;
  if (match.confidence < profile.minPatternScore) return 0;

  let score = match.confidence;
  if (profile.preferredPatternTypes.includes(match.patternType)) {
    score = Math.min(1, score * PREFERRED_PATTERN_BOOST);
  }
  return Math.round(score * 10000) / 10000;
}
