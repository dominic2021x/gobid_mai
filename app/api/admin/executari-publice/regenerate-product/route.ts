/**
 * POST /api/admin/executari-publice/regenerate-product
 * Regenerează un produs existent din listing REPES (actualizează titlu, descriere, preț etc.).
 * Reîmprospătează întâi listing-ul din REPES ca titlul și celelalte câmpuri să fie la zi.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { fetchRepesHtml, fetchRepesHtmlWithBrowser } from "@/lib/scraper-repes/http";
import { parseRepesDetailPage } from "@/lib/scraper-repes/parseDetail";

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
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let listing: Record<string, unknown> | null = null;
  {
    const { data: listingRow, error: listError } = await supabaseAdmin
      .from("repes_listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (listError || !listingRow) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    listing = listingRow as Record<string, unknown>;
  }

  const productId = (listing as { product_id?: string }).product_id;
  if (!productId) {
    return NextResponse.json({ error: "Listing not published (no product_id)" }, { status: 400 });
  }

  // Reîmprospătează listing-ul din REPES (pagina de detaliu e SPA – folosim browser ca să obținem conținutul real)
  const sourceUrl = (listing as { source_url?: string }).source_url;
  if (sourceUrl && typeof sourceUrl === "string") {
    try {
      let html: string;
      try {
        html = await fetchRepesHtmlWithBrowser(sourceUrl, { timeoutMs: 35000 });
      } catch {
        html = await fetchRepesHtml(sourceUrl);
      }
      const detail = parseRepesDetailPage(html, sourceUrl);
      const hasMeaningfulData = (detail.title && detail.title.trim().length >= 2) || (detail.priceText && String(detail.priceText).trim().length > 0);
      if (hasMeaningfulData) {
        const auctionDateStr = detail.auctionDate && detail.auctionTime
          ? `${detail.auctionDate}T${detail.auctionTime}:00`
          : detail.auctionDate ?? null;
        const formattedPrice = detail.priceText ? formatPriceTextForDisplayEuropean(detail.priceText) : null;
        await supabaseAdmin
          .from("repes_listings")
          .update({
            title: detail.title || (listing as { title?: string }).title,
            price_text: formattedPrice && formattedPrice !== "—" ? formattedPrice : detail.priceText ?? (listing as { price_text?: string }).price_text,
            location_raw: detail.locationRaw ?? (listing as { location_raw?: string }).location_raw,
            description_html: detail.descriptionHtml ?? (listing as { description_html?: string }).description_html,
            seller_name: detail.sellerName ?? (listing as { seller_name?: string }).seller_name,
            seller_email: detail.sellerEmail ?? (listing as { seller_email?: string }).seller_email,
            seller_phone: detail.sellerPhone ?? (listing as { seller_phone?: string }).seller_phone,
            seller_address: detail.sellerAddress ?? (listing as { seller_address?: string }).seller_address,
            pdf_url: detail.pdfUrl ?? (listing as { pdf_url?: string }).pdf_url,
            pdf_urls: detail.pdfUrls?.length ? detail.pdfUrls : (listing as { pdf_urls?: string[] }).pdf_urls,
            auction_date: auctionDateStr ?? (listing as { auction_date?: string }).auction_date,
            auction_time: detail.auctionTime ?? (listing as { auction_time?: string }).auction_time,
            meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : (listing as { meta_fields?: unknown }).meta_fields,
            updated_at: new Date().toISOString(),
          })
          .eq("id", listingId);
        const { data: fresh } = await supabaseAdmin.from("repes_listings").select("*").eq("id", listingId).single();
        if (fresh) listing = fresh as Record<string, unknown>;
      }
    } catch (refreshErr) {
      console.warn("[regenerate-product] Refresh listing from REPES failed, using existing listing:", refreshErr);
    }
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

  // Actualizăm doar câmpurile de afișare (titlu, descriere, preț, imagini, slug etc.).
  // NU actualizăm custom_fields – câmpurile sincronizate (Detalii din anunț, executor) rămân neschimbate.
    const mainCategory = (listing as { main_category?: string | null }).main_category?.trim() || "Imobiliare";
  const subcategory = (listing as { category?: string | null }).category?.trim() || "executari-publice";

  const updatePayload = {
    title,
    description,
    category: "Executări și Insolvență",
    subcategory,
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
