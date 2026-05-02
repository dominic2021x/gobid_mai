/**
 * Semantic: query embedding + similarity with graph_embeddings -> entity boosts (node ids + scores).
 * If search_query_embeddings missing: generate with text-embedding-3-small and upsert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const SEMANTIC_TOP_K = 20;
const EMBED_DIM = 1536;
const MODEL = "text-embedding-3-small";

export async function retrieveSemantic(
  supabase: SupabaseClient,
  qNorm: string
): Promise<Map<string, number>> {
  let { data: row } = await supabase
    .from("search_query_embeddings")
    .select("embedding")
    .eq("q_norm", qNorm)
    .maybeSingle();

  let embedding = (row as { embedding?: number[] } | null)?.embedding;
  if (!embedding || !Array.isArray(embedding) || embedding.length !== EMBED_DIM) {
    try {
      const { generateEmbedding } = await import("@/utils/embeddings");
      embedding = await generateEmbedding(qNorm.slice(0, 8000), EMBED_DIM);
      if (embedding && embedding.length === EMBED_DIM) {
        await supabase.from("search_query_embeddings").upsert(
          {
            q_norm: qNorm,
            embedding,
            model: MODEL,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "q_norm" }
        );
      }
    } catch {
      return new Map();
    }
  }
  if (!embedding || embedding.length !== EMBED_DIM) return new Map();

  const { data: matches } = await supabase.rpc("match_graph_embeddings", {
    query_embedding: embedding,
    match_count: SEMANTIC_TOP_K,
  });

  if (!Array.isArray(matches)) return new Map();
  const map = new Map<string, number>();
  for (const m of matches as Array<{ node_id: string; similarity?: number }>) {
    if (m?.node_id) map.set(m.node_id, Number(m.similarity ?? 0));
  }
  return map;
}

/** Fallback: no RPC - use raw query if match_graph_embeddings does not exist */
export async function getSemanticNodeScores(
  supabase: SupabaseClient,
  qNorm: string
): Promise<Map<string, number>> {
  try {
    return await retrieveSemantic(supabase, qNorm);
  } catch {
    return new Map();
  }
}
