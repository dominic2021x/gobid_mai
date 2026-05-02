/**
 * Match a normalized phrase to a pattern type using taxonomy and profile.
 * Deterministic, O(tokens) per phrase.
 */

import type {
  PatternType,
  PatternMatchResult,
  PatternProfile,
  PatternSegments,
  MarketplaceTaxonomy,
  MatchPatternOptions,
} from "./types";
import { normalizePatternInput } from "./normalizePatternInput";

function hasToken(tokens: string[], ...values: string[]): boolean {
  const set = new Set(values.map((v) => v.toLowerCase()));
  return tokens.some((t) => set.has(t));
}

function tokenAt(tokens: string[], i: number): string | undefined {
  return tokens[i];
}

/** Check if consecutive tokens form a known multi-word brand. */
function findBrandSpan(taxonomy: MarketplaceTaxonomy, tokens: string[], start: number): number {
  let end = start;
  let best = start;
  let acc = tokens[start] ?? "";
  if (taxonomy.brandSlugs.has(acc)) best = end + 1;
  for (let j = start + 1; j < tokens.length; j++) {
    acc = acc + " " + (tokens[j] ?? "");
    if (taxonomy.brandSlugs.has(acc)) best = j + 1;
    end = j;
  }
  return best;
}

/**
 * Match phrase to a pattern type and extract segments.
 */
export function matchPatternProfile(
  phraseNorm: string,
  options: MatchPatternOptions
): PatternMatchResult {
  const { taxonomy, profile, verticalHint } = options;
  const { tokens } = normalizePatternInput(phraseNorm);
  const segments: PatternSegments = {};
  let patternType: PatternType = "invalid";
  let confidence = 0;

  if (tokens.length === 0) {
    return {
      patternType: "invalid",
      confidence: 0,
      vertical: null,
      segments: {},
      invalid: true,
    };
  }

  const last = tokens[tokens.length - 1];
  const weakLast = profile.weakLastTokens.has(last ?? "");
  const hasInvalidToken = tokens.some((t) => profile.invalidTokens.has(t));
  if (hasInvalidToken) {
    return {
      patternType: "invalid",
      confidence: 0,
      vertical: profile.vertical,
      segments: {},
      invalid: true,
    };
  }

  let categoryIdx = tokens.findIndex((t) => taxonomy.categorySlugs.has(t));
  let hasCategory = categoryIdx >= 0;
  let category = hasCategory ? tokenAt(tokens, categoryIdx) : undefined;
  if (!hasCategory) {
    for (const [cat, subs] of taxonomy.subcategoryByCategory) {
      const subIdx = tokens.findIndex((t) => subs.has(t));
      if (subIdx >= 0) {
        category = cat;
        hasCategory = true;
        segments.subcategory = tokenAt(tokens, subIdx);
        break;
      }
    }
  }
  if (category) segments.category = category;

  let subcategory: string | undefined = segments.subcategory;
  if (hasCategory && category && taxonomy.subcategoryByCategory.has(category) && !subcategory) {
    const subs = taxonomy.subcategoryByCategory.get(category)!;
    const subIdx = tokens.findIndex((t) => subs.has(t));
    if (subIdx >= 0) {
      subcategory = tokenAt(tokens, subIdx);
      segments.subcategory = subcategory;
    }
  }

  let brandEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    const span = findBrandSpan(taxonomy, tokens, i);
    if (span > i) {
      segments.brand = tokens.slice(i, span).join(" ");
      brandEnd = span;
      break;
    }
  }

  const hasGeo = tokens.some(
    (t) => taxonomy.geoCounties.has(t) || taxonomy.geoCities.has(t)
  );
  if (hasGeo) {
    segments.geo = tokens.filter(
      (t) => taxonomy.geoCounties.has(t) || taxonomy.geoCities.has(t)
    );
  }

  const hasAttribute = tokens.some((t) => profile.highValueAttributes.has(t) || taxonomy.attributeKeys.has(t));
  if (hasAttribute) {
    segments.attributes = tokens.filter(
      (t) => profile.highValueAttributes.has(t) || taxonomy.attributeKeys.has(t)
    );
  }

  if (hasCategory && !hasGeo && !segments.brand) {
    if (segments.attributes?.length) {
      patternType = "category_attribute";
      confidence = 0.85;
    } else if (subcategory) {
      patternType = "subcategory";
      confidence = 0.9;
    } else {
      patternType = "category";
      confidence = 0.85;
    }
  }

  if (hasCategory && hasGeo) {
    patternType = "category_attribute_geo";
    confidence = Math.max(confidence, 0.8);
  }

  if (segments.brand) {
    const afterBrand = tokens.slice(brandEnd);
    const modelTokens = afterBrand.filter(
      (t) =>
        !taxonomy.geoCounties.has(t) &&
        !taxonomy.geoCities.has(t) &&
        !profile.weakLastTokens.has(t)
    );
    if (modelTokens.length > 0) {
      segments.model = modelTokens[0];
      if (modelTokens.length > 1) segments.variant = modelTokens.slice(1).join(" ");
    }
    if (hasGeo && segments.brand) {
      patternType = "brand_model_geo";
      confidence = Math.max(confidence, 0.8);
    } else if (segments.model || segments.variant) {
      patternType = segments.variant ? "brand_model_variant" : "brand_model";
      confidence = Math.max(confidence, 0.85);
    } else {
      patternType = "brand";
      confidence = Math.max(confidence, 0.9);
    }
  }

  if (!hasCategory && !segments.brand && hasGeo && tokens.length <= 3) {
    patternType = "geo_only";
    confidence = Math.max(confidence, 0.85);
  }

  if (patternType === "invalid" && tokens.length >= 1 && !weakLast && !hasInvalidToken) {
    patternType = "mixed";
    confidence = profile.allowMixed ? 0.5 : 0.3;
  }

  const invalid =
    patternType === "invalid" ||
    (weakLast && confidence < 0.8) ||
    !profile.validPatternTypes.includes(patternType);

  return {
    patternType,
    confidence: Math.min(1, Math.max(0, confidence)),
    vertical: verticalHint ?? profile.vertical,
    segments,
    invalid,
  };
}
