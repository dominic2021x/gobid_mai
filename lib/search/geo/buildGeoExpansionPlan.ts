/**
 * Build geo expansion plan: tiers (exact place -> nearby -> county rest) for progressive results.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedLocation, GeoExpansionPlan, GeoExpansionTier } from "./types";
import { NEARBY_MAX_KM, NEARBY_MAX_PLACES } from "./constants";

export async function buildGeoExpansionPlan(
  supabase: SupabaseClient,
  parsedLocation: ParsedLocation
): Promise<GeoExpansionPlan> {
  const tiers: GeoExpansionTier[] = [];
  let order = 0;

  if (!parsedLocation.countyId && !parsedLocation.placeId) {
    return {
      parsedLocation,
      tiers: [],
      hasGeoIntent: !!(parsedLocation.countyCode || parsedLocation.placeNameNorm),
    };
  }

  const countyId = parsedLocation.countyId ?? null;
  const placeId = parsedLocation.placeId ?? null;

  if (placeId) {
    tiers.push({
      tier: "exact_place",
      countyId,
      placeIds: [placeId],
      label: "Exact location",
      order: order++,
    });

    const { data: neighbors } = await supabase
      .from("geo_neighbors")
      .select("neighbor_place_id, distance_km")
      .eq("place_id", placeId)
      .lte("distance_km", NEARBY_MAX_KM)
      .order("distance_km", { ascending: true })
      .limit(NEARBY_MAX_PLACES);
    const neighborIds = (neighbors ?? []).map((r: { neighbor_place_id: string }) => r.neighbor_place_id);
    if (neighborIds.length > 0) {
      tiers.push({
        tier: "nearby_places",
        countyId,
        placeIds: neighborIds,
        label: "Nearby",
        order: order++,
      });
    }
  }

  if (countyId) {
    if (!placeId) {
      const { data: major } = await supabase
        .from("geo_places")
        .select("id")
        .eq("county_id", countyId)
        .in("type", ["municipality", "city"])
        .order("importance_score", { ascending: false })
        .limit(10);
      const majorIds = (major ?? []).map((r: { id: string }) => r.id);
      if (majorIds.length > 0) {
        tiers.push({
          tier: "county_major",
          countyId,
          placeIds: majorIds,
          label: "Major cities",
          order: order++,
        });
      }
    }

    const { data: towns } = await supabase
      .from("geo_places")
      .select("id")
      .eq("county_id", countyId)
      .eq("type", "town")
      .order("importance_score", { ascending: false })
      .limit(20);
    const townIds = (towns ?? []).map((r: { id: string }) => r.id);
    if (townIds.length > 0) {
      tiers.push({
        tier: "county_towns",
        countyId,
        placeIds: townIds,
        label: "Towns",
        order: order++,
      });
    }

    tiers.push({
      tier: "county_rest",
      countyId,
      placeIds: [],
      label: "Rest of county",
      order: order++,
    });
  }

  return {
    parsedLocation,
    tiers,
    hasGeoIntent: true,
  };
}
