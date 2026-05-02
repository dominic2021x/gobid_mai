/**
 * Build full search plan: intent + geo expansion plan + filters.
 */

import type { SearchPlan } from "./types";
import { parseSearchIntent } from "./parseSearchIntent";
import { extractStructuredFilters } from "./extractStructuredFilters";
import { buildGeoExpansionPlan } from "../geo/buildGeoExpansionPlan";
import type { GeoResolver } from "../geo/parseLocationFromQuery";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_FIRST_TIER_LIMIT = 30;

/**
 * Build search plan from raw query and optional Supabase for geo resolution + expansion.
 */
export async function buildSearchPlan(
  query: string,
  supabase: SupabaseClient | null
): Promise<SearchPlan> {
  let geoResolver: GeoResolver | null = null;
  if (supabase) {
    geoResolver = async ({ countyCodeNorm, placeNameNorm }) => {
      let countyId: string | null = null;
      let placeId: string | null = null;
      let placeType: "municipality" | "city" | "town" | "commune" | "village" | null = null;
      let ambiguous = false;

      if (countyCodeNorm) {
        const { data: byName } = await supabase
          .from("geo_counties")
          .select("id")
          .eq("name_norm", countyCodeNorm)
          .limit(1)
          .maybeSingle();
        if ((byName as { id: string } | null)?.id) {
          countyId = (byName as { id: string }).id;
        } else {
          const { data: byCode } = await supabase
            .from("geo_counties")
            .select("id")
            .eq("code", countyCodeNorm.toLowerCase())
            .limit(1)
            .maybeSingle();
          countyId = (byCode as { id: string } | null)?.id ?? null;
        }
      }

      if (placeNameNorm) {
        const q = supabase.from("geo_places").select("id, county_id, type");
        if (countyId) q.eq("county_id", countyId);
        q.ilike("name_norm", placeNameNorm);
        const { data: places } = await q.limit(3);
        const arr = (places ?? []) as Array<{ id: string; county_id: string; type: string }>;
        if (arr.length === 1) {
          placeId = arr[0].id;
          placeType = arr[0].type as "municipality" | "city" | "town" | "commune" | "village";
          if (!countyId) countyId = arr[0].county_id;
        } else if (arr.length > 1) {
          placeId = arr[0].id;
          placeType = arr[0].type as "municipality" | "city" | "town" | "commune" | "village";
          if (!countyId) countyId = arr[0].county_id;
          ambiguous = true;
        } else {
          const { data: aliasRow } = await supabase
            .from("geo_place_aliases")
            .select("place_id")
            .eq("alias_norm", placeNameNorm)
            .limit(2)
            .maybeSingle();
          if (aliasRow) {
            const pid = (aliasRow as { place_id: string }).place_id;
            const { data: place } = await supabase.from("geo_places").select("id, county_id, type").eq("id", pid).single();
            if (place) {
              placeId = (place as { id: string }).id;
              placeType = (place as { type: string }).type as "municipality" | "city" | "town" | "commune" | "village";
              if (!countyId) countyId = (place as { county_id: string }).county_id;
            }
          }
        }
      }

      return { countyId, placeId, placeType, ambiguous };
    };
  }

  const intent = await parseSearchIntent(query, geoResolver);
  const filters = extractStructuredFilters(intent);
  const geoPlan = supabase ? await buildGeoExpansionPlan(supabase, intent.location) : null;

  return {
    intent,
    geoPlan,
    filters,
    firstTierLimit: DEFAULT_FIRST_TIER_LIMIT,
  };
}
