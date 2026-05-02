/**
 * Lexical retrieval: existing listings repo, limit 200 candidates.
 */

import { getRoListings } from "@/lib/server/products/listingsRepo";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import type { AccessContext } from "@/lib/server/access/resolveAccess";
import type { SearchCandidate } from "./types";

export const LEXICAL_CAP = 200;

export async function retrieveLexical(
  query: ProductQuery,
  access?: AccessContext
): Promise<SearchCandidate[]> {
  const result = await getRoListings(
    { ...query, from: 0, limit: LEXICAL_CAP },
    access
  );
  const items = result.items ?? [];
  return items.map((item, i) => {
    const id = String((item as { id?: string }).id ?? `lex-${i}`);
    const lexScore = 1 - i / Math.max(items.length, 1);
    return {
      id,
      item,
      lexScore,
      score: lexScore,
      category: (item as { category?: string }).category,
      county: (item as { county?: string }).county,
    } as SearchCandidate;
  });
}
