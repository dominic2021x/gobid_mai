/**
 * GET un singur listing REPES cu imagini
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = _request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: listing, error: listError } = await supabaseAdmin
    .from("repes_listings")
    .select("*")
    .eq("id", id)
    .single();

  if (listError || !listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: images } = await supabaseAdmin
    .from("repes_listing_images")
    .select("id, url, sort_order")
    .eq("listing_id", id)
    .order("sort_order", { ascending: true });

  let product_cod_anunt: string | null = null;
  let product_slug: string | null = null;
  const productId = (listing as { product_id?: string | null }).product_id;
  if (productId) {
    const { data: product } = await supabaseAdmin.from("products").select("custom_fields, slug").eq("id", productId).single();
    const p = product as { custom_fields?: { cod_anunt?: string } | null; slug?: string } | null;
    if (p?.custom_fields) {
      const cf = p.custom_fields as Record<string, string> | undefined;
      const cod = cf?.cod_anunt ?? cf?.["Cod anunț"];
      if (cod && String(cod).trim()) product_cod_anunt = String(cod).trim();
    }
    if (p?.slug) product_slug = p.slug;
  }

  return NextResponse.json({
    success: true,
    listing: {
      ...listing,
      images: images || [],
      product_cod_anunt,
      product_slug,
    },
  });
}

/** PATCH actualizează doar main_category și/sau category pentru un listing REPES. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: { main_category?: string | null; category?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  if (Object.prototype.hasOwnProperty.call(body, "main_category")) {
    update.main_category = body.main_category == null || body.main_category === "" ? null : String(body.main_category).trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "category")) {
    update.category = body.category == null || body.category === "" ? null : String(body.category).trim() || null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("repes_listings")
    .update(update)
    .eq("id", id)
    .select("id, main_category, category")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, listing: updated });
}
