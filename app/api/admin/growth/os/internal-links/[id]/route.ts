import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_STATUS = new Set(["draft", "applied", "removed"]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { id } = await params;
  let body: { status?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!status || !ALLOWED_STATUS.has(status)) {
    return growthJsonError("Invalid status", "BAD_REQUEST", 400);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("seo_internal_links")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  if (!data) return growthJsonError("Not found", "NOT_FOUND", 404);
  await supabase.from("growth_events").insert({
    type: "seo_internal_links_updated",
    meta: { id, status },
  });
  return NextResponse.json(data);
}
