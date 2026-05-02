/**
 * POST /api/admin/executari-publice/update-product-display
 * Actualizează doar câmpurile generate pe site (titlu, descriere, preț, imagini, slug etc.)
 * din datele curente ale listing-ului din DB. NU reîmprospătează din REPES. NU atinge custom_fields
 * (câmpurile sincronizate – Detalii din anunț, executor – rămân neschimbate).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { parseLicitatiiPrice } from "@/lib/licitatii-price";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

  const { data: listing, error: listError } = await supabaseAdmin
    .from("repes_listings")
    .select("*")
    .eq("id", listingId)
    .single();

  if (listError || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const productId = (listing as { product_id?: string }).product_id;
  if (!productId) {
    return NextResponse.json({ error: "Listing not published (no product_id)" }, { status: 400 });
  }

  const descriptionText = stripHtml((listing as { description_html?: string }).description_html).trim();
  const sourceTitle = (listing as { title?: string }).title ?? "";
  const title = sourceTitle && sourceTitle.length >= 3 ? sourceTitle : [sourceTitle, (listing as { location_raw?: string }).location_raw].filter(Boolean).join(" – ") || "Execuție publică";
  const description = descriptionText.length >= 30 ? descriptionText : [title, (listing as { location_raw?: string }).location_raw].filter(Boolean).join(". ") || "Anunț execuție publică.";

  const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice((listing as { price_text?: string }).price_text);
  const RON_EUR_RATE = 5;
  const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
  const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

  const { data: imgRows } = await supabaseAdmin.from("repes_listing_images").select("url").eq("listing_id", listingId).order("sort_order", { ascending: true });
  const images = (imgRows || []).map((r: { url: string }) => r.url).filter(Boolean);

  const baseSlug = slugify(title) || `executare-${listingId.slice(0, 8)}`;
  const { data: allSlugs } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null).neq("id", productId);
  const existingSlugs = (allSlugs || []).map((p: { slug: string }) => p.slug).filter(Boolean);
  const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

  const pdfUrls = (listing as { pdf_urls?: string[] }).pdf_urls;
  const pdfUrl = (listing as { pdf_url?: string }).pdf_url;
  const urls = Array.isArray(pdfUrls) && pdfUrls.length > 0 ? pdfUrls : (pdfUrl ? [pdfUrl] : []);
  const documents = urls.map((url, i) => ({
    name: urls.length > 1 ? `Document licitație ${i + 1}` : "Document licitație",
    url,
    type: "pdf" as const,
  }));

  const updatePayload = {
    title,
    description,
    category: "Execuții publice",
    subcategory: "executari-publice",
    starting_price: startingPriceRON,
    starting_price_ron: startingPriceRON,
    starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
    currency: priceCurrency === "EUR" ? "EUR" : "RON",
    county: (listing as { location_county?: string }).location_county ?? null,
    city: (listing as { location_city?: string }).location_city ?? null,
    address: (listing as { location_raw?: string }).location_raw ?? null,
    auction_date: (listing as { auction_date?: string }).auction_date ?? null,
    images,
    documents,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin.from("products").update(updatePayload).eq("id", productId);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    productId,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
  });
}
