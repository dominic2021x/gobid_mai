/**
 * Score a correction candidate (edit distance, length similarity, source boost).
 */

import { MAX_EDIT_DISTANCE } from "./constants";
import type { CorrectionCandidate } from "./types";

/**
 * Score 0..1: 1 = perfect match, lower for more edits and length mismatch.
 */
export function scoreCorrectionCandidate(
  original: string,
  corrected: string,
  editDistance: number,
  source: CorrectionCandidate["source"]
): number {
  const o = original.toLowerCase();
  const c = corrected.toLowerCase();
  if (o === c) return 1;

  const lenRatio = Math.min(o.length, c.length) / Math.max(o.length, c.length);
  const editScore = 1 - editDistance / (MAX_EDIT_DISTANCE + 1);
  const base = 0.5 * lenRatio + 0.5 * Math.max(0, editScore);

  let sourceBoost = 1;
  if (source === "category" || source === "subcategory") sourceBoost = 1.05;
  else if (source === "geo") sourceBoost = 1.02;

  return Math.min(1, base * sourceBoost);
}
