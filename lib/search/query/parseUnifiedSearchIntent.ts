/**
 * Parse unified search intent: category + geo + query, with vertical and channel.
 * Wraps parseSearchIntent and maps to UnifiedSearchIntent + SearchVertical.
 */

import type { SearchIntent } from "./types";
import type { UnifiedSearchIntent, SearchVertical, SearchChannel } from "../ranking/core/types";
import { parseSearchIntent } from "./parseSearchIntent";
import type { GeoResolver } from "../geo/parseLocationFromQuery";

const VERTICAL_MAP: Record<string, SearchVertical> = {
  imobiliare: "imobiliare",
  autovehicule: "autovehicule",
  executari_insolventa: "executari_insolventa",
  executari: "executari_insolventa",
  utilaje: "utilaje",
};

function intentToVertical(intent: SearchIntent): SearchVertical {
  const slug = (intent.categorySlug ?? intent.vertical ?? "").toLowerCase();
  return VERTICAL_MAP[slug] ?? "default";
}

/**
 * Parse raw query into UnifiedSearchIntent (category, geo, query text).
 */
export async function parseUnifiedSearchIntent(
  query: string,
  geoResolver: GeoResolver | null,
  channel: SearchChannel = null
): Promise<UnifiedSearchIntent> {
  const intent = await parseSearchIntent(query, geoResolver ?? undefined);
  const vertical = intentToVertical(intent);

  return {
    queryNorm: intent.queryNorm,
    queryWithoutGeo: intent.queryWithoutGeo,
    categorySlug: intent.categorySlug,
    subcategorySlug: intent.subcategorySlug,
    vertical,
    location: intent.location,
    isNavigational: intent.isNavigational,
    channel,
  };
}
