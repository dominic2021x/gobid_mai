import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery } from "@/lib/growth/graph/extract";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 300;
const CAP = 10;
const MIN_QUERY_LENGTH = 1;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q")?.trim() ?? "";
  const q = normalizeQuery(raw);
  if (q.length < MIN_QUERY_LENGTH) {
    const res = NextResponse.json({ nodes: [], queries: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const supabase = createAdminClient();
  const pattern = `${q}%`;
  const [queriesRes, nodesRes] = await Promise.all([
    supabase.from("graph_queries").select("q_norm, best_node_id, score").ilike("q_norm", pattern).order("score", { ascending: false }).limit(CAP),
    supabase.from("graph_nodes").select("id, kind, slug, label").ilike("label", pattern).order("popularity", { ascending: false }).limit(CAP),
  ]);
  const queries = (queriesRes.data ?? []).slice(0, CAP);
  const nodes = (nodesRes.data ?? []).slice(0, CAP);
  const res = NextResponse.json({ nodes, queries });
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res;
}
