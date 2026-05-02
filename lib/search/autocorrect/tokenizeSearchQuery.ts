/**
 * Tokenize normalized search query for per-token correction.
 */

import type { TokenizedQuery } from "./types";
import { normalizeSearchQuery } from "./normalizeSearchQuery";

/**
 * Split query into tokens and record start indices.
 */
export function tokenizeSearchQuery(normalizedOrRaw: string): TokenizedQuery {
  const normalized = normalizeSearchQuery(normalizedOrRaw);
  const trimmed = normalized.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const tokenStarts: number[] = [];
  let pos = 0;
  for (const t of tokens) {
    const i = trimmed.indexOf(t, pos);
    tokenStarts.push(i >= 0 ? i : pos);
    pos = i >= 0 ? i + t.length : pos + t.length + 1;
  }
  return { normalized: trimmed, tokens, tokenStarts };
}
