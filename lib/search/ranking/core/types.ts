/**
 * Unified search intelligence: shared types for suggestions and listing ranking.
 * Used by both autocomplete and search results.
 */

import type { ParsedLocation, GeoExpansionPlan } from "../../geo/types";

/** Vertical / category scope (imobiliare, autovehicule, etc.). */
export type SearchVertical = "imobiliare" | "autovehicule" | "executari_insolventa" | "utilaje" | "default";

/** Channel: ro (live_bid) vs executari_insolventa. */
export type SearchChannel = "ro" | "executari_insolventa" | null;

/** Unified search intent: category + geo + query understanding. */
export interface UnifiedSearchIntent {
  /** Normalized query (full). */
  queryNorm: string;
  /** Query without geo tokens (for lexical match). */
  queryWithoutGeo: string;
  /** Category slug if detected. */
  categorySlug: string | null;
  subcategorySlug: string | null;
  /** Vertical for ranking profile. */
  vertical: SearchVertical;
  /** Parsed location. */
  location: ParsedLocation;
  isNavigational: boolean;
  /** Channel from request. */
  channel: SearchChannel;
}

/** Ranking profile per vertical (weights and behavior). */
export interface RankingProfile {
  vertical: SearchVertical;
  /** Weights for suggestion scoring (0..1 scale). */
  suggestionWeights: SuggestionWeightSet;
  /** Weights for listing scoring. */
  listingWeights: ListingWeightSet;
  /** Geo weight when geo intent present. */
  geoWeight: number;
  /** Exploration boost max. */
  explorationBoostMax: number;
  /** Apply geo tiering (progressive widening). */
  useGeoTiering: boolean;
}

export interface SuggestionWeightSet {
  lexical: number;
  source: number;
  frequency: number;
  recency: number;
  ctr: number;
  quality: number;
  context: number;
  exploration: number;
  qualityPenalty: number;
  /** Pattern engine quality (structure, vertical). */
  pattern: number;
  /** Query-to-suggestion affinity (CTR for this query). */
  queryAffinity: number;
}

export interface ListingWeightSet {
  textual: number;
  category: number;
  geo: number;
  freshness: number;
  quality: number;
  premium: number;
  engagement: number;
  exploration: number;
}

/** Unified search plan: intent + geo plan + ranking profile. */
export interface UnifiedSearchPlan {
  intent: UnifiedSearchIntent;
  geoPlan: GeoExpansionPlan | null;
  /** Profile for this request (vertical-aware). */
  profile: RankingProfile;
  /** First-tier candidate limit (progressive). */
  firstTierLimit: number;
  /** Page number (for progressive widening). */
  page: number;
}

/** Query features (shared input for scoring). */
export interface QueryFeatures {
  queryNorm: string;
  queryLength: number;
  hasGeoIntent: boolean;
  hasCategoryIntent: boolean;
  tokenCount: number;
}

/** Geo features for one candidate (suggestion or listing). */
export interface GeoFeatures {
  countyMatch: number;
  placeMatch: number;
  distanceScore: number;
  placeImportance: number;
  tierOrder: number;
}

/** Behavior features (CTR, impressions, recency). */
export interface BehaviorFeatures {
  impressions: number;
  clicks: number;
  ctr: number;
  recency: number;
  savedCount: number;
}

/** Listing quality features (title, images, completeness). */
export interface ListingQualityFeatures {
  titleQuality: number;
  imageCount: number;
  imageQualityProxy: number;
  fieldCompleteness: number;
  freshness: number;
  spamPenalty: number;
}

/** Seller quality features. */
export interface SellerQualityFeatures {
  completeness: number;
  trustScore: number;
  responseRate: number;
  stalePenalty: number;
}

/** Business rules (promo, pin, boost, suppress). */
export interface BusinessFeatures {
  isPinned: number;
  boost: number;
  suppress: number;
  isPremium: number;
}
