/**
 * Suggestion quality filters and pattern analysis.
 * Used before reranking to drop garbage suggestions (price/unit/year/etc.).
 * When taxonomy + profile are provided, uses universal pattern engine for keep decision.
 *
 * All logic is deterministic and cheap (O(tokens) per suggestion).
 */

import type { SuggestionCandidate } from "../ranking/types";
import type { MarketplaceTaxonomy, PatternProfile } from "@/lib/search/patterns/types";
import { filterPatternCandidate } from "@/lib/search/patterns/quality/filterPatternCandidate";

/** Tokens that are almost never good as the last word of a suggestion. */
const WEAK_LAST_TOKENS = new Set([
  "km",
  "an",
  "ani",
  "lei",
  "leu",
  "ron",
  "euro",
  "eur",
  "roni",
  "vanzare",
  "fab",
  "barca",
  "aparate",
  "aparat",
  "sudura",
  "lipit",
  "pian",
]);

/** Tokens that by themselves are too weak to be a suggestion. */
const WEAK_TOKENS = new Set([
  "km",
  "an",
  "ani",
  "pret",
  "preț",
  "lei",
  "euro",
  "info",
  "detalii",
  "poze",
  "vanzare",
  "fab",
  "barca",
  "aparate",
  "aparat",
  "sudura",
  "lipit",
]);

/** Known auto brands – if phrase contains 2+ of these as words, treat as mixed-brand garbage. */
const AUTO_BRANDS = new Set([
  "audi",
  "bmw",
  "dacia",
  "ford",
  "iveco",
  "opel",
  "volkswagen",
  "vw",
  "mercedes",
  "renault",
  "peugeot",
  "citroen",
  "jaguar",
  "toyota",
  "honda",
  "nissan",
  "skoda",
  "seat",
  "volvo",
  "fiat",
  "porsche",
  "lexus",
  "jeep",
  "mini",
  "tesla",
  "cupra",
  "ds",
  "suzuki",
  "mazda",
  "hyundai",
  "kia",
]);

/** Very short filler tokens – ignored for structure scoring. */
const FILLER_TOKENS = new Set(["de", "la", "cu", "si", "și", "in", "în", "pe"]);

export type SemanticSuggestionKind =
  | "brand"
  | "model"
  | "category"
  | "category_variant"
  | "geo"
  | "mixed"
  | "other";

export type SuggestionStructureInfo = {
  semanticKind: SemanticSuggestionKind;
  /** 0..1 – how well the phrase matches a known pattern (brand + model, category + qualifier etc.). */
  patternScore: number;
  /** True if last token is weak (km, an, lei, euro...). */
  weakLastToken: boolean;
  /** True for clearly invalid combinations (only weak tokens, numeric junk, etc.). */
  invalidCombination: boolean;
};

function tokenize(phraseNorm: string): string[] {
  return phraseNorm
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function looksNumericToken(t: string): boolean {
  return /^[0-9]+([.,][0-9]+)?$/.test(t);
}

/** Heuristic classification of a suggestion phrase into a semantic kind + structure score. */
export function analyzeSuggestionStructure(phraseNorm: string): SuggestionStructureInfo {
  const tokens = tokenize(phraseNorm);
  if (tokens.length === 0) {
    return {
      semanticKind: "other",
      patternScore: 0,
      weakLastToken: false,
      invalidCombination: true,
    };
  }

  const last = tokens[tokens.length - 1];
  const weakLastToken = WEAK_LAST_TOKENS.has(last);

  const nonFiller = tokens.filter((t) => !FILLER_TOKENS.has(t));
  const onlyWeak =
    nonFiller.length > 0 && nonFiller.every((t) => WEAK_TOKENS.has(t) || looksNumericToken(t));

  // Simple patterns:
  // - brand: single token or two tokens, no numbers, not weak
  // - model: brand + model (contains letters+digits or dash)
  // - category: contains words like apartament, teren, casa, auto, imobiliare etc.
  // - geo: looks like county/city name (single or two tokens, no digits)
  let semanticKind: SemanticSuggestionKind = "other";
  let patternScore = 0;

  const hasDigit = tokens.some((t) => /\d/.test(t));

  const CATEGORY_KEYS = ["apartament", "teren", "casa", "casă", "spatiu", "spațiu", "auto", "imobiliare"];
  const hasCategoryWord = tokens.some((t) => CATEGORY_KEYS.includes(t));

  if (!hasDigit && tokens.length <= 2 && !weakLastToken && !onlyWeak) {
    semanticKind = "brand";
    patternScore = 0.7;
  }

  if (hasDigit && tokens.length >= 2 && !weakLastToken) {
    // e.g. bmw seria 3, bmw x5, golf 5
    semanticKind = semanticKind === "brand" ? "model" : "model";
    patternScore = Math.max(patternScore, 0.8);
  }

  if (hasCategoryWord) {
    if (tokens.length <= 3) {
      semanticKind = "category";
      patternScore = Math.max(patternScore, 0.8);
    } else {
      semanticKind = "category_variant";
      patternScore = Math.max(patternScore, 0.7);
    }
  }

  if (!hasDigit && tokens.length <= 3 && !hasCategoryWord && !onlyWeak) {
    // Simple geo-ish phrase (e.g. bucuresti, cluj napoca)
    semanticKind = semanticKind === "other" ? "geo" : "mixed";
    patternScore = Math.max(patternScore, 0.6);
  }

  if (semanticKind === "other" && !onlyWeak && tokens.length >= 2 && !weakLastToken) {
    semanticKind = "mixed";
    patternScore = Math.max(patternScore, 0.5);
  }

  const brandCount = tokens.filter((t) => AUTO_BRANDS.has(t)).length;
  const multiBrandGarbage = brandCount >= 2;

  const invalidCombination =
    onlyWeak ||
    multiBrandGarbage ||
    (tokens.length === 1
      ? WEAK_TOKENS.has(tokens[0]) || looksNumericToken(tokens[0])
      : false);

  return {
    semanticKind,
    patternScore: Math.min(1, Math.max(0, patternScore)),
    weakLastToken,
    invalidCombination,
  };
}

/** Key used for blacklist lookups: phrase_norm only (kind-agnostic). */
export function blacklistKey(phraseNorm: string): string {
  return phraseNorm.trim().toLowerCase();
}

export type SuggestionQualityFlags = {
  keep: boolean;
  structure: SuggestionStructureInfo;
};

/**
 * High-level filter: decide if a suggestion candidate should be kept at all.
 * - When taxonomy + profile are provided: uses pattern engine (filterPatternCandidate).
 * - Otherwise: applies structural rules (weak tokens, incomplete phrases) and DB blacklist.
 */
export function filterSuggestionCandidate(
  candidate: SuggestionCandidate,
  opts: {
    blacklist?: Set<string>;
    taxonomy?: MarketplaceTaxonomy;
    profile?: PatternProfile;
    whitelist?: Set<string>;
  } = {}
): SuggestionQualityFlags {
  const phraseNorm = candidate.phrase_norm.trim().toLowerCase();
  if (!phraseNorm || phraseNorm.length < 2) {
    return { keep: false, structure: analyzeSuggestionStructure(phraseNorm) };
  }

  if (opts.blacklist && opts.blacklist.has(blacklistKey(phraseNorm))) {
    return { keep: false, structure: analyzeSuggestionStructure(phraseNorm) };
  }

  if (opts.taxonomy && opts.profile) {
    const result = filterPatternCandidate(
      { ...candidate },
      {
        taxonomy: opts.taxonomy,
        profile: opts.profile,
        blacklist: opts.blacklist,
        whitelist: opts.whitelist,
      }
    );
    const structure: SuggestionStructureInfo = {
      semanticKind: mapPatternTypeToKind(result.patternMatch.patternType),
      patternScore: result.patternMatch.confidence,
      weakLastToken: false,
      invalidCombination: result.patternMatch.invalid,
    };
    return { keep: result.keep, structure };
  }

  const structure = analyzeSuggestionStructure(phraseNorm);

  const tokens = phraseNorm.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => t === "vanzare")) {
    return { keep: false, structure };
  }
  if (structure.invalidCombination) {
    return { keep: false, structure };
  }
  if (structure.weakLastToken && structure.patternScore < 0.8) {
    return { keep: false, structure };
  }
  if (structure.patternScore < 0.3 && phraseNorm.length <= 6) {
    return { keep: false, structure };
  }

  return { keep: true, structure };
}

function mapPatternTypeToKind(
  patternType: string
): "brand" | "model" | "category" | "category_variant" | "geo" | "mixed" | "other" {
  switch (patternType) {
    case "brand":
    case "brand_model":
    case "brand_model_variant":
      return "model";
    case "category":
    case "subcategory":
      return "category";
    case "category_attribute":
    case "category_attribute_geo":
      return "category_variant";
    case "geo_only":
      return "geo";
    case "mixed":
      return "mixed";
    default:
      return "other";
  }
}

