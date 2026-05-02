/**
 * Bulk upsert seed suggestions via RPC. Dedupes by phrase_norm + entity_type + is_public; chunks of 200.
 */

import { normalizeRo } from "@/lib/search/roNormalize";

type SupabaseAdmin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export type SeedRow = {
  phrase: string;
  phrase_norm: string;
  entity_type: string | null;
  is_public: boolean;
};

const CHUNK_SIZE = 200;

function dedupe(rows: SeedRow[]): SeedRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.phrase_norm}|${r.entity_type ?? ""}|${r.is_public}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type UpsertSeedResult = { upserted: number; distinctSent: number };

/**
 * Upsert seed suggestions. Rows must have phrase; phrase_norm and is_public can be set or derived.
 * listingId stored in meta for cursor progress. entity_type sent as '' when null for DB constraint.
 */
export async function upsertSeedSuggestions(
  supabase: SupabaseAdmin,
  rows: SeedRow[],
  listingId: string | null
): Promise<UpsertSeedResult> {
  const withNorm = rows.map((r) => ({
    phrase: r.phrase.trim(),
    phrase_norm: r.phrase_norm || normalizeRo(r.phrase.trim()),
    entity_type: r.entity_type ?? "",
    is_public: r.is_public ?? true,
  })).filter((r) => r.phrase.length >= 2 && r.phrase_norm.length >= 2);

  const deduped = dedupe(withNorm);
  let total = 0;
  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((r) => ({
      phrase: r.phrase,
      phrase_norm: r.phrase_norm,
      entity_type: r.entity_type || "",
      is_public: r.is_public,
    }));
    const { data, error } = await supabase.rpc("upsert_search_suggestion_seed", {
      _rows: payload,
      _source: "seed_titles",
      _listing_id: listingId,
    });
    if (error) throw error;
    total += (data as number) ?? 0;
  }
  return { upserted: total, distinctSent: deduped.length };
}
