/**
 * Build unified search plan: intent + geo + ranking profile (vertical-aware).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeoResolver } from "../geo/parseLocationFromQuery";
import { buildGeoExpansionPlan } from "../geo/buildGeoExpansionPlan";
import { parseUnifiedSearchIntent } from "./parseUnifiedSearchIntent";
import type { UnifiedSearchPlan, RankingProfile, SearchVertical } from "../ranking/core/types";
import {
  DEFAULT_SUGGESTION_WEIGHTS,
  DEFAULT_LISTING_WEIGHTS,
} from "../ranking/core/constants";
import { inferVerticalFromQuery } from "../patterns/inferVerticalFromQuery";
import { buildMarketplaceTaxonomy } from "../patterns/buildMarketplaceTaxonomy";
import { getProfileForSubcategory } from "../patterns/profiles/getProfileForSubcategory";
import { matchPatternProfile } from "../patterns/matchPatternProfile";

const DEFAULT_FIRST_TIER_LIMIT = 30;

function defaultGeoResolver(supabase: SupabaseClient): GeoResolver {
  return async ({ countyCodeNorm, placeNameNorm }) => {
    let countyId: string | null = null;
    let placeId: string | null = null;
    let placeType: "municipality" | "city" | "town" | "commune" | "village" | null = null;
    let ambiguous = false;

    const resolveCounty = async (norm: string): Promise<string | null> => {
      const { data: byName } = await supabase
        .from("geo_counties")
        .select("id")
        .eq("name_norm", norm)
        .limit(1)
        .maybeSingle();
      if ((byName as { id: string } | null)?.id) return (byName as { id: string }).id;
      const { data: byCode } = await supabase
        .from("geo_counties")
        .select("id")
        .eq("code", norm.toLowerCase())
        .limit(1)
        .maybeSingle();
      return (byCode as { id: string } | null)?.id ?? null;
    };

    if (countyCodeNorm) {
      countyId = await resolveCounty(countyCodeNorm);
    }

    if (placeNameNorm && !countyId) {
      countyId = await resolveCounty(placeNameNorm);
    }

    if (placeNameNorm) {
      let q = supabase.from("geo_places").select("id, county_id, type").ilike("name_norm", placeNameNorm);
      if (countyId) q = q.eq("county_id", countyId);
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

function getProfileForVertical(vertical: SearchVertical): RankingProfile {
  const suggestionWeights = { ...DEFAULT_SUGGESTION_WEIGHTS };
  const listingWeights = { ...DEFAULT_LISTING_WEIGHTS };
  let geoWeight = 1.0;
  let useGeoTiering = true;

  if (vertical === "imobiliare") {
    geoWeight = 1.2;
    useGeoTiering = true;
  } else if (vertical === "autovehicule") {
    geoWeight = 0.7;
    useGeoTiering = true;
  } else if (vertical === "executari_insolventa") {
    geoWeight = 0.8;
    useGeoTiering = true;
  }

  return {
    vertical,
    suggestionWeights,
    listingWeights,
    geoWeight,
    explorationBoostMax: 0.25,
    useGeoTiering,
  };
}

/**
 * Build unified search plan: unified intent + geo plan + vertical-aware profile.
 */
export async function buildUnifiedSearchPlan(
  query: string,
  supabase: SupabaseClient | null,
  options: {
    channel?: "ro" | "executari_insolventa" | null;
    page?: number;
  } = {}
): Promise<UnifiedSearchPlan> {
  const channel = options.channel ?? null;
  const page = Math.max(1, options.page ?? 1);

  const geoResolver = supabase ? defaultGeoResolver(supabase) : null;
  let intent = await parseUnifiedSearchIntent(query, geoResolver, channel);
  if (intent.queryNorm?.trim()) {
    if (!intent.categorySlug) {
      const inferred = inferVerticalFromQuery(intent.queryNorm);
      if (inferred?.categorySlug) {
        const verticalMap: Record<string, SearchVertical> = {
          autovehicule: "autovehicule",
          imobiliare: "imobiliare",
          executari_insolventa: "executari_insolventa",
          utilaje: "utilaje",
          electronice: "default",
          "casa-gradina": "default",
        };
        intent = {
          ...intent,
          categorySlug: inferred.categorySlug,
          vertical: verticalMap[inferred.categorySlug] ?? intent.vertical,
        };
      }
    }
    if (!intent.subcategorySlug) {
      const taxonomy = buildMarketplaceTaxonomy();
      const profile = getProfileForSubcategory(intent.categorySlug ?? null, null);
      const match = matchPatternProfile(intent.queryNorm, { taxonomy, profile });
      if (match.segments.subcategory) {
        intent = { ...intent, subcategorySlug: match.segments.subcategory };
      }
    }
  }
  const geoPlan = supabase ? await buildGeoExpansionPlan(supabase, intent.location) : null;
  const profile = getProfileForVertical(intent.vertical);

  return {
    intent,
    geoPlan,
    profile,
    firstTierLimit: DEFAULT_FIRST_TIER_LIMIT,
    page,
  };
}
