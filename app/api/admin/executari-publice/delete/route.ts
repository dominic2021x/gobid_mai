/**
 * POST /api/admin/executari-publice/delete
 * Șterge anunțuri (soft-delete: set deleted_at pe listing).
 * Dacă anunțul e publicat (product_id), șterge produsul — `product_images` în cascadă;
 * fișierele R2 rămân până la cron `uploaded-images-cleanup`.
 * Body: { listingId: string } sau { listingIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

async function isAdminUser(user: { id?: string } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
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

  let body: { listingId?: string; listingIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: string[] = body.listingIds?.length ? body.listingIds : body.listingId ? [body.listingId] : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Missing listingId or listingIds" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  let deletedProducts = 0;

  for (const listingId of ids) {
    const { data: listing, error: fetchErr } = await supabaseAdmin
      .from("repes_listings")
      .select("id, product_id")
      .eq("id", listingId)
      .single();

    if (fetchErr || !listing) continue;

    const productId = (listing as { product_id?: string | null }).product_id;
    if (productId) {
      const { error: delProdErr } = await supabaseAdmin.from("products").delete().eq("id", productId);
      if (!delProdErr) deletedProducts++;
    }

    await supabaseAdmin
      .from("repes_listings")
      .update({
        deleted_at: nowIso,
        product_id: null,
        updated_at: nowIso,
      })
      .eq("id", listingId);
  }

  return NextResponse.json({
    success: true,
    deletedListings: ids.length,
    deletedProducts,
  });
}
