/**
 * Soft autocorrect for gobid.ro search and autocomplete.
 * Typo-tolerant, Romanian diacritics-insensitive, safe and non-aggressive.
 */

/** Normalized query + tokens for correction. */
export type TokenizedQuery = {
  normalized: string;
  tokens: string[];
  /** Start index in normalized string for each token (for reconstruction). */
  tokenStarts: number[];
};

/** A single token correction candidate (e.g. "apartamnet" -> "apartament"). */
export type CorrectionCandidate = {
  original: string;
  corrected: string;
  /** 0..1, higher = better. */
  score: number;
  /** Which dictionary matched (category, geo, brand, etc.). */
  source: "category" | "subcategory" | "attribute" | "geo" | "brand" | "model" | "unknown";
};

/** Result of soft autocorrect: optional corrected query and metadata. */
export type AutocorrectResult = {
  /** Original normalized query (user input normalized). */
  originalNorm: string;
  /** Corrected query (only set if confidence >= threshold and safe). */
  correctedNorm: string | null;
  /** Confidence 0..1 for the overall correction. */
  confidence: number;
  /** Per-token corrections applied (for didYouMean display). */
  corrections: CorrectionCandidate[];
  /** Whether we applied any correction. */
  applied: boolean;
  /** Optional "Did you mean X?" suggestion when confidence is high. */
  didYouMean: string | null;
};

/** Unified search dictionary: categories, subcategories, attributes (from taxonomy). */
export type SearchDictionary = {
  categories: Set<string>;
  subcategories: Set<string>;
  attributes: Set<string>;
  /** All terms in one set for fast lookup. */
  all: Set<string>;
};

/** Geo dictionary: counties and cities. */
export type GeoDictionary = {
  counties: Set<string>;
  cities: Set<string>;
  all: Set<string>;
};

/** Brand/model dictionary. */
export type BrandDictionary = {
  brands: Set<string>;
  /** model slug -> brand slug (for context). */
  modelByBrand: Map<string, Set<string>>;
  all: Set<string>;
};
