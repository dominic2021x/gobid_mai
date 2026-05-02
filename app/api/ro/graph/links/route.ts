import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePath } from "@/lib/urls/normalizePath";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 300;
const MAX_SOURCE_LENGTH = 200;
const CAP = 10;

function validateSourcePath(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > MAX_SOURCE_LENGTH) return null;
  if (!s.startsWith("/ro")) return null;
  if (s.includes("..") || s.includes("?")) return null;
  return normalizePath(s);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source")?.trim();
  if (!source) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const sourcePath = validateSourcePath(source);
  if (!sourcePath) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("graph_link_recommendations")
    .select("target_path, anchor, score")
    .eq("source_path", sourcePath)
    .eq("status", "applied")
    .order("score", { ascending: false })
    .limit(CAP);
  if (error) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const items = (data ?? []).map((r: { target_path: string; anchor: string; score: number }) => ({ target_path: r.target_path, anchor: r.anchor, score: r.score }));
  const res = NextResponse.json({ items });
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res;
}
