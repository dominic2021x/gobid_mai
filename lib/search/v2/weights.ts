/**
 * Bucket weights for rerank. Load from search_intel_bucket_weights; fallback default.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RerankWeights {
  w_lex: number;
  w_sem: number;
  w_graph: number;
  w_fresh: number;
}

const DEFAULT_WEIGHTS: RerankWeights = {
  w_lex: 0.45,
  w_sem: 0.35,
  w_graph: 0.15,
  w_fresh: 0.05,
};

const DEFAULT_WEIGHTS_NO_SEM: RerankWeights = {
  w_lex: 0.6,
  w_sem: 0,
  w_graph: 0.25,
  w_fresh: 0.15,
};

export async function getWeightsForBucket(
  supabase: SupabaseClient,
  bucket: string
): Promise<RerankWeights> {
  const { data } = await supabase
    .from("search_intel_bucket_weights")
    .select("w_lex, w_sem, w_graph, w_fresh")
    .eq("bucket", bucket)
    .maybeSingle();
  if (!data) return DEFAULT_WEIGHTS;
  const row = data as { w_lex?: number; w_sem?: number; w_graph?: number; w_fresh?: number };
  const w_lex = Number(row.w_lex);
  const w_sem = Number(row.w_sem);
  const w_graph = Number(row.w_graph);
  const w_fresh = Number(row.w_fresh);
  if (
    Number.isFinite(w_lex) &&
    Number.isFinite(w_sem) &&
    Number.isFinite(w_graph) &&
    Number.isFinite(w_fresh) &&
    Math.abs(w_lex + w_sem + w_graph + w_fresh - 1) < 0.01
  ) {
    return { w_lex, w_sem, w_graph, w_fresh };
  }
  return DEFAULT_WEIGHTS;
}

export function getDefaultWeights(hasSem: boolean): RerankWeights {
  return hasSem ? DEFAULT_WEIGHTS : DEFAULT_WEIGHTS_NO_SEM;
}
