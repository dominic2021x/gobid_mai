/**
 * Graph boost: graph_queries.best_node_id + graph_edges -> entity boosts per candidate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCandidate } from "./types";

const MAX_EDGES = 15;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "";
}

export async function applyGraphBoost(
  supabase: SupabaseClient,
  qNorm: string,
  candidates: SearchCandidate[],
  semanticNodeScores: Map<string, number>
): Promise<SearchCandidate[]> {
  const { data: gq } = await supabase
    .from("graph_queries")
    .select("best_node_id")
    .eq("q_norm", qNorm)
    .maybeSingle();

  const bestNodeId = (gq as { best_node_id?: string } | null)?.best_node_id;
  const nodeIds = new Set<string>();
  if (bestNodeId) nodeIds.add(bestNodeId);
  for (const id of semanticNodeScores.keys()) nodeIds.add(id);

  if (nodeIds.size === 0) return candidates;

  const { data: nodes } = await supabase
    .from("graph_nodes")
    .select("id, kind, slug")
    .in("id", Array.from(nodeIds));

  const kindSlugSet = new Set<string>();
  const bestKindSlug = new Set<string>();
  for (const n of nodes ?? []) {
    const r = n as { id: string; kind: string; slug: string };
    kindSlugSet.add(`${r.kind}:${r.slug}`);
    if (r.id === bestNodeId) bestKindSlug.add(`${r.kind}:${r.slug}`);
  }

  if (bestNodeId) {
    const { data: edges } = await supabase
      .from("graph_edges")
      .select("dst_node_id")
      .eq("src_node_id", bestNodeId)
      .order("weight", { ascending: false })
      .limit(MAX_EDGES);
    const dstIds = (edges ?? []).map((e: { dst_node_id: string }) => e.dst_node_id);
    if (dstIds.length > 0) {
      const { data: dstNodes } = await supabase.from("graph_nodes").select("id, kind, slug").in("id", dstIds);
      for (const n of dstNodes ?? []) {
        const r = n as { kind: string; slug: string };
        kindSlugSet.add(`${r.kind}:${r.slug}`);
      }
    }
  }

  const nodeIdByKindSlug = new Map<string, string>();
  for (const n of nodes ?? []) {
    const r = n as { id: string; kind: string; slug: string };
    nodeIdByKindSlug.set(`${r.kind}:${r.slug}`, r.id);
  }

  return candidates.map((c) => {
    const category = (c.item as { category?: string }).category;
    const county = (c.item as { county?: string }).county;
    const catSlug = category ? slugify(String(category)) : "";
    const countySlug = county ? slugify(String(county)) : "";
    let graphScore = 0;
    let semScore = c.semScore;
    if (catSlug && bestKindSlug.has(`category:${catSlug}`)) graphScore = 0.9;
    else if (countySlug && bestKindSlug.has(`county:${countySlug}`)) graphScore = 0.9;
    else if (catSlug && kindSlugSet.has(`category:${catSlug}`)) graphScore = 0.5;
    else if (countySlug && kindSlugSet.has(`county:${countySlug}`)) graphScore = 0.5;
    const nodeId = catSlug ? nodeIdByKindSlug.get(`category:${catSlug}`) : countySlug ? nodeIdByKindSlug.get(`county:${countySlug}`) : undefined;
    if (nodeId && semanticNodeScores.has(nodeId)) semScore = semanticNodeScores.get(nodeId);
    return { ...c, graphScore, semScore };
  });
}
