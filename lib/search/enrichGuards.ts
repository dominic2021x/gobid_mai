/**
 * Filtre deterministe anti-hallucination pentru sugestiile enrich (Claude).
 * Acceptă doar fraze care au overlap de tokeni cu query-ul de bază.
 */

import { normalizeRo } from "./roNormalize";
import { tokenizeRoFromInput } from "./roTokens";

const MIN_PHRASE_LEN = 2;
const MAX_PHRASE_LEN = 80;

/**
 * Verifică dacă o frază candidat (de la Claude) este acceptabilă relativ la query-ul de bază:
 * - lungime între MIN_PHRASE_LEN și MAX_PHRASE_LEN caractere;
 * - după normalizare, nu e goală;
 * - are overlap de tokeni cu base: >= 2 tokeni comuni dacă base are >= 3 tokeni, altfel >= 1.
 */
export function acceptEnrichedPhrase(base: string, candidate: string): boolean {
  if (base == null || candidate == null || typeof base !== "string" || typeof candidate !== "string") {
    return false;
  }

  const trimmed = candidate.trim();
  if (trimmed.length < MIN_PHRASE_LEN || trimmed.length > MAX_PHRASE_LEN) {
    return false;
  }

  const baseNorm = normalizeRo(base);
  const candidateNorm = normalizeRo(candidate);
  if (!candidateNorm || candidateNorm.length < MIN_PHRASE_LEN) {
    return false;
  }

  const baseTokens = tokenizeRoFromInput(base);
  const candidateTokens = tokenizeRoFromInput(candidate);
  if (baseTokens.length === 0) {
    return false;
  }

  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  for (const t of baseTokens) {
    if (candidateSet.has(t)) overlap++;
  }

  const minOverlap = baseTokens.length >= 3 ? 2 : 1;
  return overlap >= minOverlap;
}
