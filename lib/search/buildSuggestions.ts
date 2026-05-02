import { CATEGORY_CONFIG, type SearchCategoryKey } from "./categoryConfig";

export type CategorySuggestions = {
  baseSuggestions: string[];
  readyForLocationPhase: boolean;
  supportsLocationPhase: boolean;
  normalizedBaseQuery: string;
};

function hasLocationRequiredAttributes(tokens: string[], attrs: string[]): boolean {
  if (attrs.length === 0) return true;
  const t = new Set(tokens);
  return attrs.some((a) => t.has(a));
}

export function buildCategorySuggestions(
  category: SearchCategoryKey,
  tokens: string[],
  normalizedQuery: string,
  limit: number,
): CategorySuggestions {
  const cfg = CATEGORY_CONFIG[category];
  const prefix = cfg.suggestionPrefix ?? category;
  const attrs = [...cfg.attributes];
  const base = (attrs.length > 0 ? attrs.map((a) => `${prefix} ${a}`.trim()) : [prefix]).slice(0, limit);
  const readyForLocationPhase = cfg.requiredForLocationPhase
    ? hasLocationRequiredAttributes(tokens, cfg.locationRequiredAttributes ?? [])
    : false;

  // Prefer structured base phrase when possible, else normalized user query.
  const normalizedBaseQuery = base[0] ?? normalizedQuery;

  return {
    baseSuggestions: base,
    readyForLocationPhase,
    supportsLocationPhase: cfg.requiredForLocationPhase,
    normalizedBaseQuery,
  };
}

