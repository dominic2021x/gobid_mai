/**
 * Universal marketplace pattern engine – public API.
 */

export * from "./types";
export * from "./constants";
export { normalizePatternInput } from "./normalizePatternInput";
export { buildMarketplaceTaxonomy } from "./buildMarketplaceTaxonomy";
export { matchPatternProfile } from "./matchPatternProfile";
export { scorePatternQuality } from "./scorePatternQuality";
export { getUniversalProfile } from "./profiles/universalProfile";
export { getProfileForVertical } from "./profiles/getProfileForVertical";
export { getProfileForSubcategory } from "./profiles/getProfileForSubcategory";
export { getSubcategoryProfile } from "./profiles/subcategoryProfiles";
export { inferVerticalFromQuery } from "./inferVerticalFromQuery";
