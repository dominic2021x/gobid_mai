/**
 * Query-level features (shared by suggest and listing ranking).
 */

import type { QueryFeatures } from "../ranking/core/types";

export function buildQueryFeatures(queryNorm: string): QueryFeatures {
  const trimmed = queryNorm.trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const hasGeoIntent = false; // caller can override when geo is parsed
  const hasCategoryIntent = tokens.some(
    (t) =>
      ["imobiliare", "autovehicule", "apartament", "teren", "auto", "executari", "utilaje"].indexOf(t) >= 0
  );

  return {
    queryNorm: trimmed,
    queryLength: trimmed.length,
    hasGeoIntent,
    hasCategoryIntent,
    tokenCount: tokens.length,
  };
}

/** Lexical relevance: 1 = exact, 0.5+ = prefix, 0 = no match. */
export function lexicalRelevance(queryNorm: string, phraseNorm: string): number {
  if (!queryNorm || !phraseNorm) return 0;
  const q = queryNorm.trim().toLowerCase();
  const p = phraseNorm.trim().toLowerCase();
  if (p === q) return 1;
  if (p.startsWith(q)) return 0.5 + 0.5 * Math.min(1, q.length / Math.max(1, p.length));
  if (p.includes(q)) return 0.3;
  return 0;
}

/** Phrase length penalty (prefer concise). */
export function phraseLengthPenalty(phraseNorm: string): number {
  const words = phraseNorm.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 3) return 1;
  if (words <= 5) return 0.95;
  return Math.max(0.7, 1 - (words - 5) * 0.05);
}
