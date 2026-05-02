/**
 * POST – reîmprospătează doar descrierea pentru un listing: fetch pagină, extrage descriptionHtml, salvează.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";

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

export async function POST(
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
    .select("id, source_url")
    .eq("id", id)
    .single();

  if (listError || !listing?.source_url) {
    return NextResponse.json({ error: "Listing not found or missing source_url" }, { status: 404 });
  }

  try {
    const html = await fetchHtml(listing.source_url as string);
    const detail = parseDetailPage(html, listing.source_url as string);

    const { error: updateError } = await db
      .from("licitatii_insolventa_listings")
      .update({
        description_html: detail.descriptionHtml ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const len = detail.descriptionHtml ? detail.descriptionHtml.length : 0;
    return NextResponse.json({
      success: true,
      description_html: detail.descriptionHtml,
      length: len,
      message: len > 0 ? `Descriere extrasă: ${len} caractere` : "Nu s-a putut extrage nicio descriere din pagină",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
