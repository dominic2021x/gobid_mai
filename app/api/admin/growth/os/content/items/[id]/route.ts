import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


interface RouteParams { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_content_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  if (!data) return growthJsonError("Not found", "NOT_FOUND", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { id } = await params;
  let body: { status?: string; title?: string; slug?: string; draft_md?: string; meta_json?: unknown; brief?: unknown } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const allowedStatus = new Set(["draft", "review", "published", "archived"]);
  const updates: Record<string, unknown> = {};
  if (typeof body.status === "string" && allowedStatus.has(body.status)) updates.status = body.status;
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.slug === "string") updates.slug = body.slug.trim() || null;
  if (typeof body.draft_md === "string") updates.draft_md = body.draft_md;
  if (body.meta_json !== undefined) updates.meta_json = body.meta_json;
  if (body.brief !== undefined) updates.brief = body.brief;
  if (Object.keys(updates).length === 0) return growthJsonError("No valid fields to update", "BAD_REQUEST", 400);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_content_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  await supabase.from("growth_events").insert({
    type: "growth_content_item_updated",
    meta: { id, updated: Object.keys(updates) },
  });
  return NextResponse.json(data);
}
