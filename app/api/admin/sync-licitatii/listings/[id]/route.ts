/**
 * GET un singur listing cu toate câmpurile + imagini (URL-uri)
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
  const db = supabaseAdmin;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: listing, error: listError } = await db
    .from("licitatii_insolventa_listings")
    .select("*")
    .eq("id", id)
    .single();

  if (listError || !listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: images } = await db
    .from("licitatii_insolventa_listing_images")
    .select("id, url, sort_order")
    .eq("listing_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    success: true,
    listing: {
      ...listing,
      images: images || [],
    },
  });
}
