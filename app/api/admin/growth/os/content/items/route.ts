import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_content_items")
    .select("id, type, status, title, slug, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: { type?: string; title?: string; slug?: string; brief?: unknown; meta_json?: unknown } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const type = typeof body.type === "string" ? body.type.trim() : "article";
  const title = typeof body.title === "string" ? body.title.trim() : null;
  const slug = typeof body.slug === "string" ? body.slug.trim() : null;
  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("growth_content_items")
    .insert({
      type,
      status: "draft",
      title,
      slug,
      brief: body.brief != null ? body.brief : {},
      meta_json: body.meta_json != null ? body.meta_json : {},
    })
    .select("id, type, status, title, slug, created_at")
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  await supabase.from("growth_events").insert({
    type: "growth_content_item_created",
    meta: { id: inserted.id, type: inserted.type },
  });
  return NextResponse.json(inserted);
}
