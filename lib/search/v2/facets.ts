/**
 * Facet counts: grouped count query for category and county.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchFacets } from "./types";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";

const FACETS_SAMPLE_LIMIT = 2000;
const FACETS_TOP = 50;
const DEFAULT_STATUS = ["active", "reserved", "sold", "in_progress"];

export async function getFacetCounts(
  supabase: SupabaseClient,
  filters: { categorie?: string; county?: string }
): Promise<SearchFacets> {
  let q = supabase
    .from("products")
    .select("category, county")
    .in("status", DEFAULT_STATUS)
    .neq("status", "deleted")
    .limit(FACETS_SAMPLE_LIMIT);
  if (filters.categorie && filters.categorie !== "all") {
    q = q.eq("category", filters.categorie);
  }
  if (filters.county && filters.county.trim()) {
    q = q.ilike("county", `%${filters.county.trim()}%`);
  }
  const { data: rows } = await q;
  const catCount = new Map<string, number>();
  const countyCount = new Map<string, number>();
  for (const r of rows ?? []) {
    const row = r as { category?: string; county?: string };
    const cat = (row.category ?? "").trim();
    const county = (row.county ?? "").trim();
    if (cat) catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
    if (county) countyCount.set(county, (countyCount.get(county) ?? 0) + 1);
  }
  const category = Array.from(catCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, FACETS_TOP)
    .map(([value, count]) => ({ value, label: RO_CATEGORIES[value]?.name ?? value, count }));
  const county = Array.from(countyCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, FACETS_TOP)
    .map(([value, count]) => ({ value, count }));
  return { category, county };
}
