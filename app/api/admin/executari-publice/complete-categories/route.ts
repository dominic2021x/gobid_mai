/**
 * POST – completează automat main_category și category pentru toate anunțurile REPES
 * care nu au încă categorii (inferență din titlu + descriere).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { inferRepesCategories } from "@/lib/repes/inferCategories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 120;

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

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("repes_listings")
    .select("id, title, description_html")
    .is("main_category", null);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const list = (rows || []) as { id: string; title: string | null; description_html: string | null }[];
  let updated = 0;
  for (const row of list) {
    const { main_category, category } = inferRepesCategories(row.title, row.description_html);
    const { error: updateError } = await supabaseAdmin
      .from("repes_listings")
      .update({ main_category, category })
      .eq("id", row.id);
    if (!updateError) updated++;
  }

  return NextResponse.json({
    success: true,
    totalWithoutCategory: list.length,
    updated,
    message: `Au fost completate categorii pentru ${updated} anunțuri.`,
  });
}
