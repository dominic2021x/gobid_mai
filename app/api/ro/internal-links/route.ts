import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePath } from "@/lib/urls/normalizePath";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 300;

const MAX_SOURCE_URL_LENGTH = 200;
const MAX_ITEMS = 10;

function validateSourceUrl(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > MAX_SOURCE_URL_LENGTH) return null;
  if (!s.startsWith("/ro")) return null;
  if (s.includes("..") || s.includes("?")) return null;
  return normalizePath(s);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sourceUrl = searchParams.get("source_url")?.trim();
  if (!sourceUrl) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const path = validateSourceUrl(sourceUrl);
  if (!path) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("seo_internal_links")
    .select("target_url, anchor")
    .eq("source_url", path)
    .eq("status", "applied")
    .limit(MAX_ITEMS);
  if (error) {
    const res = NextResponse.json({ items: [] });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res;
  }
  const res = NextResponse.json({
    items: (data ?? []) as { target_url: string; anchor: string }[],
  });
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return res;
}
