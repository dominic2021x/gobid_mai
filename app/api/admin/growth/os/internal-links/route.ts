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
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 200), 500);
  const status = searchParams.get("status")?.trim();

  const supabase = createAdminClient();
  let query = supabase
    .from("seo_internal_links")
    .select("id, source_url, target_url, anchor, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status && ["draft", "applied", "removed"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ items: data ?? [] });
}
