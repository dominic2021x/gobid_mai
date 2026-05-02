/**
 * Default blacklists and weak-token sets for pattern quality.
 * DB blacklist (search_suggestions_blacklist) is loaded separately and merged at runtime.
 */

const WEAK_LAST_TOKENS = new Set([
  "km", "an", "ani", "lei", "leu", "ron", "euro", "eur", "roni",
  "vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit", "pian",
  "manual", "diesel", "benzina", "automat", "pret", "preț",
  "info", "detalii", "poze",
]);

const WEAK_STANDALONE_TOKENS = new Set([
  "km", "an", "ani", "lei", "euro", "pret", "preț", "info", "detalii", "poze",
  "vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit",
]);

/** Tokens that invalidate a suggestion when present (e.g. "vanzare"). */
const INVALID_PHRASE_TOKENS = new Set([
  "vanzare", "fab", "barca", "aparate", "aparat", "sudura", "lipit",
  "info", "detalii", "poze",
]);

export function getDefaultWeakLastTokens(): Set<string> {
  return new Set(WEAK_LAST_TOKENS);
}

export function getDefaultWeakStandaloneTokens(): Set<string> {
  return new Set(WEAK_STANDALONE_TOKENS);
}

export function getDefaultInvalidPhraseTokens(): Set<string> {
  return new Set(INVALID_PHRASE_TOKENS);
}
