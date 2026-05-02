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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 200);
  const since = searchParams.get("since")?.trim();

  const supabase = createAdminClient();

  let query = supabase
    .from("growth_events")
    .select("id, type, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data, error } = await query;

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  const events = (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    created_at: row.created_at,
    meta: row.meta ?? {},
    correlationId: (row.meta as Record<string, unknown>)?.correlationId as string | undefined,
  }));

  return NextResponse.json({ events });
}
