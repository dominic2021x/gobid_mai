/**
 * POST – generează categorii pentru un singur anunț REPES (inferență din titlu + descriere).
 * Body: { listingId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { inferRepesCategories } from "@/lib/repes/inferCategories";

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

  let body: { listingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const listingId = body.listingId;
  if (!listingId) {
    return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
  }

  const { data: listing, error: fetchError } = await supabaseAdmin
    .from("repes_listings")
    .select("id, title, description_html")
    .eq("id", listingId)
    .single();

  if (fetchError || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const { main_category, category } = inferRepesCategories(
    (listing as { title?: string | null }).title,
    (listing as { description_html?: string | null }).description_html
  );

  const { error: updateError } = await supabaseAdmin
    .from("repes_listings")
    .update({ main_category, category })
    .eq("id", listingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    main_category,
    category,
    message: "Categoriile au fost generate și salvate.",
  });
}
