import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  try {
    const [snapRes, nodeCountRes, edgeCountRes, recsRes, eventsRes, topNodesRes, topEdgesRes, linkRecsRes] = await Promise.all([
      supabase.from("growth_google_snapshots").select("result, created_at").eq("product", "graph").eq("kind", "summary").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("graph_nodes").select("id", { count: "exact", head: true }),
      supabase.from("graph_edges").select("id", { count: "exact", head: true }),
      supabase.from("graph_link_recommendations").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("growth_events").select("type, meta, created_at").in("type", ["semantic_graph_refresh", "semantic_graph_embeddings_refresh", "semantic_graph_link_recs_refresh", "semantic_graph_pages_seed"]).order("created_at", { ascending: false }).limit(20),
      supabase.from("graph_nodes").select("id, kind, slug, label, popularity").order("popularity", { ascending: false }).limit(30),
      supabase.from("graph_edges").select("id, src_node_id, dst_node_id, rel, weight").order("weight", { ascending: false }).limit(30),
      supabase.from("graph_link_recommendations").select("id, source_path, target_path, anchor, score, status").order("score", { ascending: false }).limit(50),
    ]);
    const snapshot = snapRes.data?.result ?? null;
    const snapshotAt = (snapRes.data as { created_at?: string } | null)?.created_at ?? null;
    const nodeCount = nodeCountRes.count ?? 0;
    const edgeCount = edgeCountRes.count ?? 0;
    const draftRecsCount = recsRes.count ?? 0;
    const lastRuns = (eventsRes.data ?? []).map((e: { type: string; meta?: Record<string, unknown>; created_at?: string }) => ({ type: e.type, meta: e.meta, at: e.created_at }));
    const topNodes = topNodesRes.data ?? [];
    const topEdges = topEdgesRes.data ?? [];
    const linkRecs = linkRecsRes.data ?? [];
    return NextResponse.json({
      snapshot,
      snapshotAt,
      nodeCount,
      edgeCount,
      draftRecsCount,
      lastRuns,
      topNodes,
      topEdges,
      linkRecs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
