/**
 * POST /api/admin/licitatii-insolventa/regenerate-products
 * Regenerează titlul și descrierea pentru mai multe produse (cele care au listing-ul selectat și product_id).
 * Body: { listingIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
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

  let body: { listingIds?: string[]; productIdsOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingIds = body.listingIds;
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return NextResponse.json({ error: "Missing or empty listingIds" }, { status: 400 });
  }

  const productIdsOnly = body.productIdsOnly === true;
  const uniq = [...new Set(listingIds)].slice(0, productIdsOnly ? 2000 : 200);
  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("licitatii_insolventa_listings")
    .select("id, product_id")
    .in("id", uniq)
    .not("product_id", "is", null);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const productIds = (rows || []).map((r: { product_id: string }) => r.product_id).filter(Boolean);
  if (productIds.length === 0) {
    return NextResponse.json({
      success: true,
      regenerated: 0,
      failed: 0,
      productIds: [],
      message: "Niciun anunț selectat nu are produs publicat pe site.",
    });
  }

  if (productIdsOnly) {
    return NextResponse.json({ success: true, productIds });
  }

  const origin = new URL(request.url).origin;
  let regenerated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const productId of productIds) {
    try {
      const res = await fetch(`${origin}/api/admin/licitatii-insolventa/regenerate-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) regenerated++;
      else {
        failed++;
        if (data.error && errors.length < 10) errors.push(`${productId}: ${data.error}`);
      }
    } catch (e) {
      failed++;
      if (errors.length < 10) errors.push(`${productId}: ${e instanceof Error ? e.message : "Eroare"}`);
    }
  }

  return NextResponse.json({
    success: true,
    regenerated,
    failed,
    total: productIds.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
