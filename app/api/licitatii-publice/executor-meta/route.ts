/**
 * GET /api/licitatii-publice/executor-meta?productId=xxx
 * Returnează meta_fields (Detalii din anunț) din repes_listings pentru produsul publicat.
 * Folosit pentru business card când custom_fields pe produs nu conține încă Email/Telefon/Adresă.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "Lipsește productId" }, { status: 400 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const { data: listing, error } = await supabaseAdmin
    .from("repes_listings")
    .select("meta_fields")
    .eq("product_id", productId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const meta = listing?.meta_fields && typeof listing.meta_fields === "object" ? listing.meta_fields : null;
  return NextResponse.json({ meta });
}
