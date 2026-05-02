/**
 * Build autocorrect result: tokenize, find typos, generate and score candidates, apply safe corrections.
 */

import { MIN_CONFIDENCE_TO_APPLY, MIN_CONFIDENCE_DID_YOU_MEAN, MAX_QUERY_LENGTH_AUTOCORRECT } from "./constants";
import { tokenizeSearchQuery } from "./tokenizeSearchQuery";
import { isLikelyTypo } from "./isLikelyTypo";
import { generateCorrectionCandidates } from "./generateCorrectionCandidates";
import { applyMergedSplits } from "./phraseLevelCorrections";
import type { AutocorrectResult, CorrectionCandidate } from "./types";
import type { Dictionaries } from "./isLikelyTypo";

/**
 * Build full autocorrect result for a normalized query.
 * Returns corrected query only when confidence is high and safe.
 */
export function buildAutocorrectResult(
  normalizedQuery: string,
  dicts: Dictionaries
): AutocorrectResult {
  const originalNorm = normalizedQuery.trim().toLowerCase();
  if (originalNorm.length > MAX_QUERY_LENGTH_AUTOCORRECT) {
    return {
      originalNorm,
      correctedNorm: null,
      confidence: 0,
      corrections: [],
      applied: false,
      didYouMean: null,
    };
  }

  const tokenized = tokenizeSearchQuery(originalNorm);
  const tokensAfterPhrase = applyMergedSplits(tokenized.tokens, dicts);
  const corrections: CorrectionCandidate[] = [];
  const correctedTokens = tokensAfterPhrase.slice();

  for (let i = 0; i < tokensAfterPhrase.length; i++) {
    const token = tokensAfterPhrase[i];
    if (!isLikelyTypo(token, dicts)) continue;

    const candidates = generateCorrectionCandidates(token, dicts);
    const best = candidates[0];
    if (!best || best.score < MIN_CONFIDENCE_TO_APPLY) continue;

    correctedTokens[i] = best.corrected;
    corrections.push(best);
  }

  const applied = corrections.length > 0;
  const correctedNorm = applied
    ? correctedTokens.join(" ")
    : null;

  const confidence = applied && corrections.length > 0
    ? corrections.reduce((s, c) => s + c.score, 0) / corrections.length
    : 0;

  const didYouMean = correctedNorm && confidence >= MIN_CONFIDENCE_DID_YOU_MEAN
    ? correctedNorm
    : null;

  return {
    originalNorm,
    correctedNorm: applied && confidence >= MIN_CONFIDENCE_TO_APPLY ? correctedNorm : null,
    confidence,
    corrections,
    applied,
    didYouMean,
  };
}
