/**
 * Fetch geo suggestions (counties, places) for autocomplete.
 * Used by suggest route to merge "teren intravilan dolj" / "apartament Craiova" style suggestions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLocation } from "./normalizeLocation";

export interface GeoSuggestionItem {
  phrase: string;
  kind: "county" | "city";
  meta: { countyId?: string; placeId?: string; countyCode?: string };
}

const GEO_SUGGEST_LIMIT = 8;

/**
 * Return county and place suggestions matching query norm (prefix match on name_norm).
 */
export async function getGeoSuggestions(
  supabase: SupabaseClient,
  queryNorm: string,
  limit: number = GEO_SUGGEST_LIMIT
): Promise<GeoSuggestionItem[]> {
  const q = normalizeLocation(queryNorm).trim();
  if (q.length < 2) return [];

  const half = Math.max(1, Math.floor(limit / 2));
  const [countiesRes, placesRes] = await Promise.all([
    supabase
      .from("geo_counties")
      .select("id, code, name, name_norm")
      .ilike("name_norm", `${q}%`)
      .order("name_norm")
      .limit(half),
    supabase
      .from("geo_places")
      .select("id, name, name_norm, county_id")
      .ilike("name_norm", `${q}%`)
      .order("importance_score", { ascending: false })
      .limit(half),
  ]);

  const out: GeoSuggestionItem[] = [];
  for (const r of countiesRes.data ?? []) {
    const row = r as { id: string; code: string; name: string };
    out.push({
      phrase: row.name,
      kind: "county",
      meta: { countyId: row.id, countyCode: row.code },
    });
  }
  for (const r of placesRes.data ?? []) {
    const row = r as { id: string; name: string; county_id: string };
    out.push({
      phrase: row.name,
      kind: "city",
      meta: { placeId: row.id, countyId: row.county_id },
    });
  }
  return out.slice(0, limit);
}
