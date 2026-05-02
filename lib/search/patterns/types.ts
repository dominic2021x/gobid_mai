/**
 * Universal marketplace pattern engine – types.
 * Pattern types used for autocomplete and search suggestions across all verticals.
 */

/** Structured pattern type for a suggestion phrase. */
export type PatternType =
  | "category"
  | "subcategory"
  | "brand"
  | "brand_model"
  | "brand_model_variant"
  | "category_attribute"
  | "category_attribute_geo"
  | "brand_model_geo"
  | "geo_only"
  | "mixed"
  | "invalid";

/** Vertical / category slug for profile selection. */
export type VerticalSlug =
  | "auto"
  | "real_estate"
  | "executari"
  | "electronics"
  | "agri_industrial"
  | "home_garden"
  | "universal";

/** Result of matching a phrase against the pattern engine. */
export type PatternMatchResult = {
  patternType: PatternType;
  /** 0..1 confidence that this is the correct pattern. */
  confidence: number;
  /** Vertical that matched (if any). */
  vertical: VerticalSlug | null;
  /** Extracted segments for debugging / ranking. */
  segments: PatternSegments;
  /** Whether the phrase is considered invalid (garbage). */
  invalid: boolean;
};

export type PatternSegments = {
  category?: string;
  subcategory?: string;
  brand?: string;
  model?: string;
  variant?: string;
  attributes?: string[];
  geo?: string[];
};

/** Profile that defines valid patterns and rules per vertical. */
export type PatternProfile = {
  vertical: VerticalSlug;
  /** Pattern types that are valid for this vertical. */
  validPatternTypes: PatternType[];
  /** Pattern types that get a boost (preferred). */
  preferredPatternTypes: PatternType[];
  /** Tokens that invalidate a suggestion when present. */
  invalidTokens: Set<string>;
  /** Tokens that are weak as last token. */
  weakLastTokens: Set<string>;
  /** High-value attribute keys (e.g. "camere", "ha") for this vertical. */
  highValueAttributes: Set<string>;
  /** Min pattern score to accept (0..1). */
  minPatternScore: number;
  /** Whether to allow mixed patterns. */
  allowMixed: boolean;
};

/** Normalized input for pattern matching. */
export type NormalizedPatternInput = {
  /** Lowercase, no diacritics. */
  normalized: string;
  /** Token list. */
  tokens: string[];
  /** Original length. */
  length: number;
};

/** Taxonomy data used by the pattern engine (categories, brands, attributes, geo). */
export type MarketplaceTaxonomy = {
  categorySlugs: Set<string>;
  subcategoryByCategory: Map<string, Set<string>>;
  brandSlugs: Set<string>;
  modelByBrand: Map<string, Set<string>>;
  attributeKeys: Set<string>;
  geoCounties: Set<string>;
  geoCities: Set<string>;
};

/** Options for pattern matching. */
export type MatchPatternOptions = {
  taxonomy: MarketplaceTaxonomy;
  profile: PatternProfile;
  /** Optional: if provided, only consider this vertical. */
  verticalHint?: VerticalSlug | null;
};
