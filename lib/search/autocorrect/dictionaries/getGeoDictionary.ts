/**
 * Build geo dictionary (counties, cities) from taxonomy + Romanian aliases.
 */

import type { MarketplaceTaxonomy } from "@/lib/search/patterns/types";
import type { GeoDictionary } from "../types";
import { GEO_ALIASES } from "./geoAliases";

export function getGeoDictionary(taxonomy: MarketplaceTaxonomy): GeoDictionary {
  const counties = new Set(taxonomy.geoCounties);
  const cities = new Set(taxonomy.geoCities);
  for (const [alias, canonical] of Object.entries(GEO_ALIASES)) {
    const a = alias.toLowerCase().trim();
    if (!a || a.length < 2) continue;
    if (counties.has(canonical) || taxonomy.geoCounties.has(canonical)) {
      counties.add(a);
    }
    if (cities.has(canonical) || taxonomy.geoCities.has(canonical)) {
      cities.add(a);
    }
  }
  const all = new Set<string>([...counties, ...cities]);
  return { counties, cities, all };
}
