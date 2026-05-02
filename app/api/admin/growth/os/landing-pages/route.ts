import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 100);
  const q = searchParams.get("q")?.trim() ?? "";

  const supabase = createAdminClient();
  let query = supabase
    .from("seo_landing_pages")
    .select("slug, status, noindex, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (q) {
    query = query.ilike("slug", `%${q}%`);
  }
  const { data, error } = await query;
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ items: data ?? [] });
}
