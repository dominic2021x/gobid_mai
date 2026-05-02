/**
 * POST – reîmprospătează câmpurile unui listing REPES din pagina de detaliu.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchRepesHtml } from "@/lib/scraper-repes/http";
import { parseRepesDetailPage } from "@/lib/scraper-repes/parseDetail";
import { inferRepesCategories } from "@/lib/repes/inferCategories";

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
    .select("id, source_url")
    .eq("id", id)
    .single();

  if (listError || !listing?.source_url) {
    return NextResponse.json({ error: "Listing not found or missing source_url" }, { status: 404 });
  }

  try {
    const html = await fetchRepesHtml(listing.source_url as string);
    const detail = parseRepesDetailPage(html, listing.source_url as string);

    const auctionDate = detail.auctionDate && detail.auctionTime
      ? `${detail.auctionDate}T${detail.auctionTime}:00`
      : detail.auctionDate;

    const { main_category, category } = inferRepesCategories(detail.title, detail.descriptionHtml);

    await supabaseAdmin
      .from("repes_listings")
      .update({
        title: detail.title,
        price_text: detail.priceText,
        location_raw: detail.locationRaw,
        description_html: detail.descriptionHtml,
        seller_name: detail.sellerName,
        seller_email: detail.sellerEmail,
        seller_phone: detail.sellerPhone,
        seller_address: detail.sellerAddress,
        pdf_url: detail.pdfUrl,
        auction_date: auctionDate || null,
        auction_time: detail.auctionTime,
        meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : null,
        main_category,
        category,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    const { data: existingImages } = await supabaseAdmin.from("repes_listing_images").select("id").eq("listing_id", id);
    if (existingImages?.length) {
      await supabaseAdmin.from("repes_listing_images").delete().eq("listing_id", id);
    }
    if (detail.imageUrls.length > 0) {
      const imageRows = detail.imageUrls.map((url, i) => ({ listing_id: id, url, sort_order: i }));
      await supabaseAdmin.from("repes_listing_images").insert(imageRows);
    }

    return NextResponse.json({
      success: true,
      message: "Detalii actualizate.",
      modifiedFields: ["title", "price_text", "location_raw", "description_html", "seller_*", "pdf_url", "auction_date", "images"],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
