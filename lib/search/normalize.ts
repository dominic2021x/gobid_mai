/**
 * Shared normalization for search: strip diacritics, lowercase, tokenize, RO stopwords.
 * Tokens length >= 2 except allow patterns like x3, g5, s10.
 */

const RO_STOPWORDS = new Set([
  'si', 'și', 'de', 'la', 'cu', 'pentru', 'din', 'in', 'în', 'un', 'o', 'a', 'al', 'ale',
  'anunt', 'anunț', 'vand', 'vând', 'cumpar', 'cumpăr', 'ofer', 'ofertă', 'licitatie', 'licitație',
  'stare', 'nou', 'noua', 'folosit', 'second', 'hand', 'procent', 'baterie', 'baterii',
  'vanzare', 'vânzare', 'masina', 'mașină', 'masini', 'auto',
]);

/** Strip diacritics (NFD + remove combining marks) */
export function stripDiacritics(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lowercase + strip diacritics for matching */
export function normalizeForMatch(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return stripDiacritics(s).toLowerCase().trim();
}

/** Remove punctuation (keep letters, numbers, spaces) */
export function removePunctuation(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Allow short tokens that look like model codes: x3, g5, s10, iphone12, etc. */
const SHORT_TOKEN_PATTERN = /^(x\d+|g\d+|s\d+|a\d+|e\d+|m\d+|iphone\d*|samsung|galaxy|ipad|macbook|ron|eur|lei|km|cp|cai|an)$/i;

/**
 * Tokenize: normalize, split, remove stopwords, keep tokens length >= 2 or matching SHORT_TOKEN_PATTERN.
 */
export function tokenize(query: string): string[] {
  if (!query || typeof query !== 'string') return [];
  const normalized = normalizeForMatch(removePunctuation(query));
  if (!normalized) return [];
  const raw = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const t of raw) {
    if (RO_STOPWORDS.has(t)) continue;
    if (t.length >= 2) {
      tokens.push(t);
      continue;
    }
    if (t.length === 1 && /[\p{L}\p{N}]/u.test(t)) {
      tokens.push(t);
      continue;
    }
    if (SHORT_TOKEN_PATTERN.test(t)) tokens.push(t);
  }
  return tokens;
}

export { RO_STOPWORDS };
