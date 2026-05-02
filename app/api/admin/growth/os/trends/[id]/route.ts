import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_STATUSES = new Set(["accepted", "ignored"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { id } = await params;
  if (!id) return growthJsonError("Missing id", "BAD_REQUEST", 400);
  const body = await req.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!ALLOWED_STATUSES.has(status)) {
    return growthJsonError("Invalid status; use accepted or ignored", "BAD_REQUEST", 400);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_trend_items")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json(data);
}
