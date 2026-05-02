/**
 * Phrase-level heuristics: merged tokens, split tokens, bounded and safe.
 */

import type { Dictionaries } from "./isLikelyTypo";

const MAX_MERGED_TOKEN_LENGTH = 28;
const MIN_PART_LENGTH = 2;

/**
 * Try to split a single token that might be two terms merged (e.g. apartamentcraiova -> apartament craiova).
 * Returns [left, right] if both parts exist in dictionaries, else null.
 */
export function trySplitMergedToken(
  token: string,
  dicts: Dictionaries
): [string, string] | null {
  const t = token.toLowerCase().trim();
  if (t.length < MIN_PART_LENGTH * 2 + 1 || t.length > MAX_MERGED_TOKEN_LENGTH) return null;

  const all = new Set<string>([
    ...dicts.search.all,
    ...dicts.geo.all,
    ...dicts.brand.all,
  ]);

  for (let i = MIN_PART_LENGTH; i <= t.length - MIN_PART_LENGTH; i++) {
    const left = t.slice(0, i);
    const right = t.slice(i);
    if (all.has(left) && all.has(right)) return [left, right];
  }
  return null;
}

/**
 * Apply merged-token splits to token array in place; bounded to one split per query.
 */
export function applyMergedSplits(
  tokens: string[],
  dicts: Dictionaries
): string[] {
  const out: string[] = [];
  let didSplit = false;
  for (const token of tokens) {
    if (!didSplit) {
      const split = trySplitMergedToken(token, dicts);
      if (split) {
        out.push(split[0], split[1]);
        didSplit = true;
        continue;
      }
    }
    out.push(token);
  }
  return out;
}
