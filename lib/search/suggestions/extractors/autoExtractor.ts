/**
 * Auto (brand + model) suggestion extraction from listing titles.
 * Small embedded brand list; detect brand then 1–3 tokens for model; ignore years and stopwords.
 */

import { toNorm } from "../normalize";

export type Candidate = { entity_type: string; label: string };

/** Top ~50 brands for prefix match (lowercase). */
const BRANDS = [
  "jaguar", "bmw", "mercedes", "audi", "volkswagen", "vw", "opel", "ford", "dacia", "renault",
  "peugeot", "citroen", "toyota", "honda", "nissan", "mazda", "hyundai", "kia", "skoda", "seat",
  "volvo", "saab", "alfa romeo", "fiat", "porsche", "lexus", "land rover", "jeep", "mini", "smart",
  "tesla", "cupra", "ds", "tata", "chery", "suzuki", "mitsubishi", "subaru", "infiniti",
  "bentley", "rolls royce", "maserati", "ferrari", "lamborghini", "aston martin", "lotus",
  "iveco", "man", "scania", "daf",
];

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
/** Cuvinte de ignorat în model (inclusiv variante tip "suv-ul" prin prima parte). */
const STOPWORDS = new Set([
  "si", "de", "la", "cu", "pentru", "din", "in", "pe", "a", "al", "ale", "o", "un", "unei",
  "diesel", "benzina", "automat", "manual", "suv", "sedan", "break", "hatchback",
  "coupe", "cabrio", "albastru", "negru", "alb", "gri", "rosu", "verde",
  "lux", "luxe", "luxu", "luxul", "care", "imbina", "imbin",
]);
/** Tokeni care indică spec motor/putere – nu fac parte din numele modelului. */
const SPEC_TOKENS = new Set(["cmc", "cm3", "cc", "hp", "cp", "kw", "tdi", "tsi", "dci"]);

/**
 * Find first brand match in normalized title (prefer earlier in string).
 */
function findBrand(norm: string): { brand: string; index: number } | null {
  let best: { brand: string; index: number } | null = null;
  const lower = norm.toLowerCase();
  for (const b of BRANDS) {
    const idx = lower.indexOf(b);
    if (idx === -1) continue;
    const atWordBoundary = idx === 0 || /\s/.test(lower[idx - 1]);
    if (!atWordBoundary) continue;
    if (best === null || idx < best.index) best = { brand: b, index: idx };
  }
  return best;
}

/** Title-case a word (e.g. jaguar -> Jaguar). */
function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Format brand for display (e.g. "land rover" -> "Land Rover"). */
function formatBrand(brand: string): string {
  return brand.split(/\s+/).map(titleCase).join(" ");
}

/** True dacă tokenul e stopword sau e compus din stopword (ex. suv-ul). */
function isStopwordToken(t: string): boolean {
  const lower = t.toLowerCase();
  if (STOPWORDS.has(lower)) return true;
  const firstPart = lower.split("-")[0];
  return firstPart.length >= 2 && STOPWORDS.has(firstPart);
}

/**
 * Extract 1–2 tokens after brand for model only (e.g. XJ, F-PACE).
 * Skip years, stopwords, pure numbers, engine/spec tokens (cmc, hp, etc.).
 */
function extractModelTokens(
  norm: string,
  afterBrandIndex: number,
  brandNorm: string
): string[] {
  const rest = norm.slice(afterBrandIndex + brandNorm.length).trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const modelTokens: string[] = [];
  for (const t of tokens) {
    if (YEAR_PATTERN.test(t) || isStopwordToken(t)) continue;
    const lower = t.toLowerCase();
    if (SPEC_TOKENS.has(lower)) continue;
    if (/^\d+$/.test(t)) continue; // skip pure numbers (e.g. 3996)
    if (t.length >= 2 && /^[\p{L}\p{N}\-]+$/u.test(t)) {
      modelTokens.push(t);
      if (modelTokens.length >= 2) break; // doar brand + model scurt (max 2 tokeni)
    }
  }
  return modelTokens;
}

/**
 * Extract auto suggestions: brand only, then brand + model (e.g. Jaguar F-PACE).
 */
export function extractAuto(title: string): Candidate[] {
  if (!title || typeof title !== "string") return [];
  const norm = toNorm(title);
  const found = findBrand(norm);
  if (!found) return [];

  const out: Candidate[] = [];
  const brandDisplay = formatBrand(found.brand);
  out.push({ entity_type: "auto", label: brandDisplay });

  const modelTokens = extractModelTokens(norm, found.index, found.brand);
  if (modelTokens.length > 0) {
    const modelPart = modelTokens.join(" ");
    if (modelPart.length >= 2) {
      out.push({ entity_type: "auto", label: `${brandDisplay} ${modelPart}` });
    }
  }
  return out;
}
