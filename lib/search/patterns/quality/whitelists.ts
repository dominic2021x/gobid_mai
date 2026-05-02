/**
 * Whitelists for pattern engine: phrases or patterns that are always accepted.
 * DB whitelist (search_pattern_whitelist) can be loaded and merged at runtime.
 */

/** In-memory whitelist of phrase_norm values that bypass quality filter. */
const PHRASE_WHITELIST = new Set<string>([
  "bmw",
  "audi",
  "dacia",
  "apartament",
  "teren",
  "executari",
  "iphone",
  "samsung",
]);

export function getDefaultPhraseWhitelist(): Set<string> {
  return new Set(PHRASE_WHITELIST);
}

export function isWhitelistedPhrase(phraseNorm: string, custom?: Set<string>): boolean {
  const key = phraseNorm.trim().toLowerCase();
  const set = custom ?? getDefaultPhraseWhitelist();
  return set.has(key);
}
