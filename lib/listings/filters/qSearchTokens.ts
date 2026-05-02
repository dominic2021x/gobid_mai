import { stripDiacritics } from "@/lib/search/normalize";
import { autocorrectSearchToken } from "@/lib/listings/filters/qSearchAutocorrect";

/**
 * PostgREST / Prisma: fiecare token devine un grup OR (pe coloane), iar tokenii sunt legați cu AND.
 * Interogările cu multe cuvinte repetate (ex. „BMW BMW … x5”) generează SQL enorm — dedupe + plafon.
 */
export const RO_LISTINGS_Q_MAX_SEARCH_TOKENS = 8;

/** Autocorectare lipiri pe token (fără a schimba casing-ul pentru cuvinte normale, ex. BMW). */
function expandSearchTokenForIndexing(token: string): string[] {
  const key = stripDiacritics(token).toLowerCase();
  const fixed = autocorrectSearchToken(key);
  if (fixed.includes(" ")) {
    return fixed.split(/\s+/).filter((w) => w.length >= 1);
  }
  if (fixed !== key) {
    return [fixed];
  }
  return [token];
}

/**
 * Tokeni pentru filtrul text `q`: spații normalizate, fără duplicate diacritic-insensitive,
 * păstrând forma primului cuvânt; maximum `maxTokens` intrări.
 */
export function qToDistinctSearchTokens(
  q: string,
  maxTokens: number = RO_LISTINGS_Q_MAX_SEARCH_TOKENS,
): string[] {
  const raw = q.trim().split(/\s+/).filter((w) => w.length >= 1);
  const expanded: string[] = [];
  for (const w of raw) {
    expanded.push(...expandSearchTokenForIndexing(w));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of expanded) {
    const key = stripDiacritics(w).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= maxTokens) break;
  }
  return out;
}
