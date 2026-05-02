/**
 * Business rules: pin, boost, suppress, premium.
 */

import type { BusinessFeatures } from "../ranking/core/types";

export function buildBusinessFeaturesFromListing(item: Record<string, unknown> | null): BusinessFeatures {
  if (!item) {
    return { isPinned: 0, boost: 0, suppress: 0, isPremium: 0 };
  }

  const isPinned = (item.pinned === true || item.is_pinned === true) ? 1 : 0;
  const boost = typeof item.boost === "number" ? Math.min(1, Math.max(0, item.boost)) : 0;
  const suppress = (item.suppress === true || item.hidden === true) ? 1 : 0;
  const isPremium = (item.is_premium === true || (item.premium_until && new Date(String(item.premium_until)) > new Date())) ? 1 : 0;

  return {
    isPinned,
    boost,
    suppress,
    isPremium,
  };
}

/** From admin override tables (suggestion/listing boost/suppress). */
export function buildBusinessFeaturesFromOverrides(overrides: {
  pinned?: boolean;
  boost?: number;
  suppress?: boolean;
} | null): BusinessFeatures {
  if (!overrides) return { isPinned: 0, boost: 0, suppress: 0, isPremium: 0 };
  return {
    isPinned: overrides.pinned ? 1 : 0,
    boost: typeof overrides.boost === "number" ? Math.min(1, overrides.boost) : 0,
    suppress: overrides.suppress ? 1 : 0,
    isPremium: 0,
  };
}
