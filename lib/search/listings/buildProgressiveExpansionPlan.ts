/**
 * Build progressive expansion plan for listing search: which tiers to fetch and in what order.
 * Composes geo expansion with category/query.
 */

import type { GeoExpansionPlan } from "../geo/types";
import type { SearchIntent } from "../query/types";

export interface ProgressiveTierSpec {
  tier: string;
  label: string;
  order: number;
  countyId: string | null;
  placeIds: string[];
  limit: number;
}

/**
 * From geo plan + intent, produce ordered tier specs (for DB: fetch by tier then merge).
 */
export function buildProgressiveExpansionPlan(
  geoPlan: GeoExpansionPlan | null,
  intent: SearchIntent,
  pageSize: number = 30
): ProgressiveTierSpec[] {
  if (!geoPlan || !geoPlan.hasGeoIntent || geoPlan.tiers.length === 0) {
    return [{ tier: "fallback", label: "All", order: 0, countyId: null, placeIds: [], limit: pageSize * 2 }];
  }

  const specs: ProgressiveTierSpec[] = geoPlan.tiers.map((t, i) => ({
    tier: t.tier,
    label: t.label,
    order: t.order,
    countyId: t.countyId,
    placeIds: t.placeIds,
    limit: t.tier === "exact_place" ? pageSize : Math.min(pageSize, 20),
  }));
  return specs.sort((a, b) => a.order - b.order);
}
