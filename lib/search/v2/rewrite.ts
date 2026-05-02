/**
 * Query rewrite: expand county aliases, normalize plurals, remove redundant tokens.
 * Apply before detectIntent.
 */

const COUNTY_ALIASES: Record<string, string> = {
  buc: "bucuresti",
  b: "bucuresti",
  bucuresti: "bucuresti",
  cluj: "cluj",
  timis: "timis",
  constanta: "constanta",
  brasov: "brasov",
  iasi: "iasi",
  sibiu: "sibiu",
  prahova: "prahova",
  dolj: "dolj",
  galati: "galati",
};

/** Romanian plural -> singular-ish stem (common suffixes) */
function stemToken(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith("uri")) return t.slice(0, -3) + "ure";
  if (t.endsWith("ile")) return t.slice(0, -3) + "il";
  if (t.endsWith("i") && t.length > 4) return t.slice(0, -1);
  return t;
}

const REDUNDANT = new Set([
  "si", "de", "la", "in", "cu", "pentru", "din", "pe", "ce", "o", "un", "una", "unul",
  "autoturism", "masina", "masini", "vanzare", "cumpar", "licitatie", "anunt",
]);

export function rewriteQuery(qNorm: string): string {
  if (!qNorm || !qNorm.trim()) return qNorm;
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const expanded = COUNTY_ALIASES[t] ?? t;
    const stem = stemToken(expanded);
    if (REDUNDANT.has(stem) || REDUNDANT.has(expanded)) continue;
    const key = stem.length > 2 ? stem : expanded;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(expanded);
  }
  return out.join(" ").trim() || qNorm;
}
