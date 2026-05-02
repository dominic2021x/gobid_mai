/**
 * Compute listing quality signals (for offline job or on-demand).
 * Used to populate listing_quality_signals table.
 */

import { buildListingQualityFeatures } from "../features/buildListingQualityFeatures";

export interface ListingQualitySignalsRow {
  listing_id: string;
  title_quality: number;
  image_count: number;
  image_quality_proxy: number;
  field_completeness: number;
  freshness: number;
  spam_penalty: number;
}

/**
 * Compute quality signals for one listing (item from products or similar).
 */
export function computeListingQualitySignals(
  listingId: string,
  item: Record<string, unknown>
): ListingQualitySignalsRow {
  const f = buildListingQualityFeatures(item);
  return {
    listing_id: listingId,
    title_quality: Math.round(f.titleQuality * 10000) / 10000,
    image_count: f.imageCount,
    image_quality_proxy: Math.round(f.imageQualityProxy * 10000) / 10000,
    field_completeness: Math.round(f.fieldCompleteness * 10000) / 10000,
    freshness: Math.round(f.freshness * 10000) / 10000,
    spam_penalty: Math.round(f.spamPenalty * 10000) / 10000,
  };
}
