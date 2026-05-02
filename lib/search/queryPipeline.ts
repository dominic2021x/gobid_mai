import { normalizeRoQuery } from "./roNormalize";

const MAX_TOKENS = 10;

const SEARCH_SYNONYMS: Record<string, string[]> = {
  apartament: ["apartamente", "garsoniera", "imobiliare"],
  casa: ["case", "imobiliare"],
  teren: ["terenuri", "imobiliare"],
  autoturism: ["autoturisme", "masina", "auto"],
  masina: ["masini", "autoturism", "auto"],
};

export type QueryPipelineResult = {
  raw: string;
  normalized: string;
  tokens: string[];
  expandedTokens: string[];
};

export type QueryPipelineOptions = {
  expandSynonyms?: boolean;
  synonymsMap?: Record<string, string[]>;
};

function isNumericToken(token: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(token);
}

function expandSearchTokens(
  tokens: string[],
  synonymsMap: Record<string, string[]>,
): string[] {
  const out = [...tokens];
  const seen = new Set(tokens);
  for (const tok of tokens) {
    if (isNumericToken(tok)) continue;
    const syns = synonymsMap[tok];
    if (!syns) continue;
    for (const syn of syns) {
      const next = syn.trim().toLowerCase();
      if (!next || isNumericToken(next) || seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      if (out.length >= MAX_TOKENS) return out;
    }
  }
  return out;
}

export function buildQueryPipeline(input: string, opts: QueryPipelineOptions = {}): QueryPipelineResult {
  const base = normalizeRoQuery(input);
  const tokens = base.tokens.slice(0, MAX_TOKENS);
  const normalized = tokens.join(" ");
  const expandedTokens = opts.expandSynonyms
    ? expandSearchTokens(tokens, opts.synonymsMap ?? SEARCH_SYNONYMS)
    : tokens;

  return {
    raw: base.raw,
    normalized,
    tokens,
    expandedTokens,
  };
}

