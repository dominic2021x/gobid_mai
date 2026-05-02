/**
 * Update node popularity and edge weights from sources (listings, search, GSC)
 * with deterministic weights.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const WEIGHT_LISTING_TITLE = 1;
export const WEIGHT_SEARCH_QUERY = 2;
export const WEIGHT_GSC_IMPRESSION = 0.5;
export const WEIGHT_GSC_CLICK = 1.5;

export async function updateNodePopularity(
  supabase: SupabaseClient,
  kind: string,
  slug: string,
  delta: number
): Promise<void> {
  const { data: row } = await supabase
    .from("graph_nodes")
    .select("id, popularity")
    .eq("kind", kind)
    .eq("slug", slug)
    .maybeSingle();
  if (!row) return;
  const current = Number((row as { popularity?: number }).popularity) || 0;
  await supabase
    .from("graph_nodes")
    .update({ popularity: current + delta })
    .eq("id", (row as { id: string }).id);
}

export async function incrementEdgeWeight(
  supabase: SupabaseClient,
  srcNodeId: string,
  dstNodeId: string,
  rel: string,
  delta: number,
  evidence?: Record<string, unknown>
): Promise<void> {
  const { data: row } = await supabase
    .from("graph_edges")
    .select("id, weight, evidence")
    .eq("src_node_id", srcNodeId)
    .eq("dst_node_id", dstNodeId)
    .eq("rel", rel)
    .maybeSingle();
  const currentWeight = row ? Number((row as { weight?: number }).weight) || 0 : 0;
  const currentEvidence = (row as { evidence?: Record<string, unknown> } | null)?.evidence ?? {};
  const newEvidence = evidence
    ? { ...currentEvidence, ...evidence }
    : currentEvidence;
  if (row) {
    await supabase
      .from("graph_edges")
      .update({ weight: currentWeight + delta, evidence: newEvidence })
      .eq("id", (row as { id: string }).id);
  } else {
    await supabase.from("graph_edges").insert({
      src_node_id: srcNodeId,
      dst_node_id: dstNodeId,
      rel,
      weight: delta,
      evidence: newEvidence,
    });
  }
}
