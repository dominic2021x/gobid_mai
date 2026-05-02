/**
 * Shared Romanian query normalization pipeline.
 * Deterministic, fast, and conservative to avoid over-normalizing brand/model names.
 */

const DIACRITICS_MAP: Record<string, string> = {
  ă: "a",
  â: "a",
  î: "i",
  ș: "s",
  ş: "s",
  ț: "t",
  ţ: "t",
  Ă: "a",
  Â: "a",
  Î: "i",
  Ș: "s",
  Ş: "s",
  Ț: "t",
  Ţ: "t",
};

const IRREGULAR_SINGULAR_MAP: Record<string, string> = {
  apartamente: "apartament",
  case: "casa",
  garsoniere: "garsoniera",
  terenuri: "teren",
  autoturisme: "autoturism",
  masini: "masina",
  mașini: "masina",
  camere: "camera",
  anunturi: "anunt",
  anunțuri: "anunt",
  vile: "vila",
};

const RO_ABBREV: Record<string, string> = {
  ap: "apartament",
  cam: "camere",
};

export type RoNormalizedQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
};

export type RoNormalizeOptions = {
  synonymsMap?: Record<string, string[]>;
  expandSynonyms?: boolean;
};

function replaceDiacritics(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(DIACRITICS_MAP)) {
    out = out.split(from).join(to);
  }
  return out;
}

function removeNonUseful(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s\-]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  if (!s) return [];
  return s.split(/\s+/).filter(Boolean);
}

function singularizeToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length < 4) return t;

  const irregular = IRREGULAR_SINGULAR_MAP[t];
  if (irregular) return irregular;

  // Conservative rules only.
  if (t.endsWith("uri") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ile") && t.length > 5) return `${t.slice(0, -3)}a`;
  if (t.endsWith("ele") && t.length > 5) return t.slice(0, -1);

  return t;
}

function expandTokensWithSynonyms(tokens: string[], synonymsMap: Record<string, string[]>): string[] {
  const out = [...tokens];
  const seen = new Set(tokens);
  for (const tok of tokens) {
    const syns = synonymsMap[tok];
    if (!syns || syns.length === 0) continue;
    for (const syn of syns) {
      const s = syn.trim().toLowerCase();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function normalizeRoQuery(input: string, opts: RoNormalizeOptions = {}): RoNormalizedQuery {
  const raw = typeof input === "string" ? input : "";
  if (!raw) return { raw: "", normalized: "", tokens: [] };

  let s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  s = replaceDiacritics(s);
  s = removeNonUseful(s);
  s = s.replace(/\s+/g, " ").trim();

  const baseTokens = tokenize(s).map((t) => RO_ABBREV[t] ?? t).map(singularizeToken);
  const tokens =
    opts.expandSynonyms && opts.synonymsMap
      ? expandTokensWithSynonyms(baseTokens, opts.synonymsMap)
      : baseTokens;

  return {
    raw: raw.trim(),
    normalized: tokens.join(" "),
    tokens,
  };
}

// Backward-compatible helper used in existing modules.
export function normalizeRo(input: string): string {
  return normalizeRoQuery(input).normalized;
}
