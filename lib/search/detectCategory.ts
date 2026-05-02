import { CATEGORY_CONFIG, type SearchCategoryKey } from "./categoryConfig";

export type DetectedCategory = SearchCategoryKey | null;

function hasAny(tokens: string[], words: string[]): boolean {
  const set = new Set(tokens);
  return words.some((w) => set.has(w));
}

export function detectCategoryFromTokens(tokens: string[]): DetectedCategory {
  if (tokens.length === 0) return null;
  const matches: Array<{ key: SearchCategoryKey; priority: number }> = [];
  for (const [key, cfg] of Object.entries(CATEGORY_CONFIG) as Array<[SearchCategoryKey, (typeof CATEGORY_CONFIG)[SearchCategoryKey]]>) {
    const termHit = hasAny(tokens, cfg.baseTerms);
    const prefixHit =
      (cfg.partialPrefixes ?? []).length > 0 &&
      tokens.some((t) => (cfg.partialPrefixes ?? []).some((p) => t.startsWith(p)));
    if (termHit || prefixHit) {
      matches.push({ key, priority: cfg.priority });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  return matches[0].key;

}

