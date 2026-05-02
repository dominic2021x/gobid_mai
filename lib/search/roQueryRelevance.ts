import { normalizeRo } from "./roNormalize";
import type { SearchResult } from "./types";

export type DetectedCategory = "imobiliare" | "auto" | null;

const AUTO_BRANDS = new Set([
  "audi",
  "bmw",
  "mercedes",
  "mercedes-benz",
  "volkswagen",
  "vw",
  "skoda",
  "renault",
  "dacia",
  "ford",
  "opel",
  "toyota",
  "honda",
  "nissan",
  "mazda",
  "kia",
  "hyundai",
  "peugeot",
  "citroen",
  "fiat",
  "seat",
  "suzuki",
  "tesla",
  "lexus",
  "volvo",
  "jaguar",
  "land",
  "range",
  "rover",
  "porsche",
  "ferrari",
  "lamborghini",
  "mitsubishi",
  "subaru",
]);

/** Remove diacritics and singularize common RO plural endings. */
export function normalizeRomanianQuery(input: string): string {
  const base = normalizeRo(input);
  if (!base) return "";
  const tokens = base.split(/\s+/).filter(Boolean).map(toSingularToken);
  return tokens.join(" ").trim();
}

function toSingularToken(token: string): string {
  if (token.length < 4) return token;
  if (token === "apartamente") return "apartament";
  if (token === "case") return "casa";

  const rules: Array<[RegExp, string]> = [
    [/urilor$/u, "ului"],
    [/ilor$/u, "i"],
    [/urile$/u, "ul"],
    [/ele$/u, "e"],
    [/lele$/u, "l"],
    [/uri$/u, ""],
    [/ile$/u, "a"],
    [/lor$/u, ""],
    [/ii$/u, "i"],
    [/e$/u, ""],
  ];

  for (const [re, replacement] of rules) {
    if (re.test(token)) {
      const next = token.replace(re, replacement);
      if (next.length >= 3) return next;
    }
  }
  return token;
}

/** Original + normalized + explicit synonym forms. */
export function expandRomanianQuery(input: string): string[] {
  const raw = input.trim();
  if (!raw) return [];
  const normalized = normalizeRomanianQuery(raw);
  const out = new Set<string>([raw]);
  if (normalized && normalized !== raw) out.add(normalized);

  const qn = ` ${normalized} `;
  if (qn.includes(" apartament ")) out.add(normalized.replace(/\bapartament\b/g, "apartamente"));
  if (qn.includes(" apartamente ")) out.add(normalized.replace(/\bapartamente\b/g, "apartament"));
  if (qn.includes(" casa ")) out.add(normalized.replace(/\bcasa\b/g, "case"));
  if (qn.includes(" case ")) out.add(normalized.replace(/\bcase\b/g, "casa"));

  return [...out].filter((q) => q.trim().length > 0);
}

export function detectCategoryIntent(normalizedQuery: string): DetectedCategory {
  if (!normalizedQuery) return null;
  const q = ` ${normalizedQuery} `;

  if (
    q.includes(" apartament ") ||
    q.includes(" apartamente ") ||
    q.includes(" casa ") ||
    q.includes(" case ") ||
    q.includes(" garsoniera ") ||
    q.includes(" teren ") ||
    q.includes(" imobil ")
  ) {
    return "imobiliare";
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (
    tokens.some((t) => AUTO_BRANDS.has(t)) ||
    q.includes(" autoturism ") ||
    q.includes(" masina ") ||
    q.includes(" auto ") ||
    q.includes(" suv ")
  ) {
    return "auto";
  }

  return null;
}

/** Add 0.2-0.5 score boost when result category matches detected intent. */
export function applyCategoryBoost(results: SearchResult[], detected: DetectedCategory): SearchResult[] {
  if (!detected || results.length === 0) return results;
  return results.map((r) => {
    const cat = String(r.category ?? "").toLowerCase();
    const sub = String(r.metadata?.subcategory ?? "").toLowerCase();
    let boost = 0;
    if (detected === "imobiliare") {
      if (cat.includes("imobil")) boost = 0.5;
      else if (sub.includes("apart") || sub.includes("casa") || sub.includes("teren")) boost = 0.35;
    } else if (detected === "auto") {
      if (cat.includes("auto")) boost = 0.5;
      else if (sub.includes("auto") || sub.includes("autotur") || sub.includes("suv")) boost = 0.3;
    }
    if (boost <= 0) return r;
    return { ...r, score: Math.min(1.5, (r.score ?? 0) + boost) };
  });
}
