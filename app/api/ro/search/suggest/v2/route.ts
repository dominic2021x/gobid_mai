import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery } from "@/lib/search/v2/normalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 300;
const CAP = 12;
const MIN_LEN = 1;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q")?.trim() ?? "";
  const qNorm = normalizeQuery(raw);
  if (qNorm.length < MIN_LEN) {
    const res = NextResponse.json({ suggestions: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const pattern = qNorm + "%";
  const supabase = createAdminClient();
  const [queriesRes, nodesRes] = await Promise.all([
    supabase.from("graph_queries").select("q_norm, score").ilike("q_norm", pattern).order("score", { ascending: false }).limit(CAP),
    supabase.from("graph_nodes").select("label, popularity").ilike("label", pattern).order("popularity", { ascending: false }).limit(CAP),
  ]);
  const items: Array<{ text: string; score: number }> = [];
  const seen = new Set<string>();
  for (const r of queriesRes.data ?? []) {
    const q = (r as { q_norm: string; score?: number }).q_norm;
    if (q && !seen.has(q)) {
      seen.add(q);
      items.push({ text: q, score: Number((r as { score?: number }).score) || 0 });
    }
  }
  for (const r of nodesRes.data ?? []) {
    const label = (r as { label: string; popularity?: number }).label;
    if (label && !seen.has(label)) {
      seen.add(label);
      items.push({ text: label, score: Number((r as { popularity?: number }).popularity) || 0 });
    }
  }
  items.sort((a, b) => b.score - a.score);
  const suggestions = items.slice(0, CAP).map((x) => ({ text: x.text, score: x.score }));
  const res = NextResponse.json({ suggestions });
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res;
}
