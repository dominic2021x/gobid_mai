/**
 * Normalize query/phrase for pattern matching.
 * Uses existing roNormalize for consistency; outputs token list for pattern logic.
 */

import { normalizeRo } from "@/lib/search/roNormalize";
import type { NormalizedPatternInput } from "./types";

/**
 * Normalize a phrase for pattern matching: lowercase, no diacritics, tokens.
 */
export function normalizePatternInput(phrase: string): NormalizedPatternInput {
  if (phrase == null || typeof phrase !== "string") {
    return { normalized: "", tokens: [], length: 0 };
  }
  const normalized = normalizeRo(phrase);
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    normalized,
    tokens,
    length: normalized.length,
  };
}
