/**
 * POST /api/admin/executari-publice/update-listing-and-product
 * Actualizează listing-ul REPES și produsul publicat cu toate câmpurile editabile.
 * Salvare instant pe site: titlu, descriere, preț, imagini, PDF-uri, locație, data licitației, categorii.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { getRoCategoryAndSubcategoryForRepes } from "@/lib/data/ro-categories";
import { getCodAnuntFormat3Litere5CifreE } from "@/lib/licitatii-cod-anunt";
import { getCategoryDefaultImageUrl } from "@/lib/getProductDisplayImage";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const RON_EUR_RATE = 5;

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

  let body: {
    listingId: string;
    title?: string | null;
    description_html?: string | null;
    price_text?: string | null;
    location_county?: string | null;
    location_city?: string | null;
    location_raw?: string | null;
    auction_date?: string | null;
    auction_time?: string | null;
    pdf_urls?: string[];
    images?: string[];
    main_category?: string | null;
    category?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { listingId, ...payload } = body;
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
    return NextResponse.json({ error: "Anunțul nu este publicat (lipsă product_id)" }, { status: 400 });
  }

  const { data: existingProduct } = await supabaseAdmin.from("products").select("custom_fields").eq("id", productId).single();
  const existingCustom = (existingProduct as { custom_fields?: Record<string, unknown> } | null)?.custom_fields && typeof (existingProduct as { custom_fields?: unknown }).custom_fields === "object"
    ? (existingProduct as { custom_fields: Record<string, unknown> }).custom_fields
    : {};

  const listingUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) listingUpdate.title = payload.title ?? null;
  if (payload.description_html !== undefined) listingUpdate.description_html = payload.description_html ?? null;
  if (payload.price_text !== undefined) listingUpdate.price_text = payload.price_text ?? null;
  if (payload.location_county !== undefined) listingUpdate.location_county = payload.location_county ?? null;
  if (payload.location_city !== undefined) listingUpdate.location_city = payload.location_city ?? null;
  if (payload.location_raw !== undefined) listingUpdate.location_raw = payload.location_raw ?? null;
  if (payload.auction_date !== undefined) listingUpdate.auction_date = payload.auction_date ?? null;
  if (payload.auction_time !== undefined) listingUpdate.auction_time = payload.auction_time ?? null;
  if (payload.main_category !== undefined) listingUpdate.main_category = payload.main_category ?? null;
  if (payload.category !== undefined) listingUpdate.category = payload.category ?? null;

  if (payload.pdf_urls !== undefined) {
    const urls = Array.isArray(payload.pdf_urls) ? payload.pdf_urls.filter((u) => typeof u === "string" && u.trim() !== "") : [];
    listingUpdate.pdf_urls = urls;
    listingUpdate.pdf_url = urls[0] ?? null;
  }

  const { error: updateListError } = await supabaseAdmin
    .from("repes_listings")
    .update(listingUpdate)
    .eq("id", listingId);

  if (updateListError) {
    return NextResponse.json({ success: false, error: updateListError.message }, { status: 500 });
  }

  if (payload.images !== undefined) {
    const { error: delErr } = await supabaseAdmin.from("repes_listing_images").delete().eq("listing_id", listingId);
    if (delErr) {
      return NextResponse.json({ success: false, error: "Failed to clear images: " + delErr.message }, { status: 500 });
    }
    const urls = Array.isArray(payload.images) ? payload.images.filter((u) => typeof u === "string" && u.trim() !== "") : [];
    if (urls.length > 0) {
      const imageRows = urls.map((url, i) => ({ listing_id: listingId, url: url.trim(), sort_order: i }));
      const { error: insErr } = await supabaseAdmin.from("repes_listing_images").insert(imageRows);
      if (insErr) {
        return NextResponse.json({ success: false, error: "Failed to insert images: " + insErr.message }, { status: 500 });
      }
    }
  }

  const title = (payload.title !== undefined ? payload.title : (listing as { title?: string }).title) ?? "";
  const descriptionHtml = payload.description_html !== undefined ? payload.description_html : (listing as { description_html?: string }).description_html;
  const descriptionText = stripHtml(descriptionHtml).trim();
  const description = descriptionText.length >= 30 ? descriptionText : [title, (payload.location_raw ?? (listing as { location_raw?: string }).location_raw)].filter(Boolean).join(". ") || "Anunț execuție publică.";

  const priceText = payload.price_text !== undefined ? payload.price_text : (listing as { price_text?: string }).price_text;
  const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice(priceText);
  const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
  const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

  let images: string[] = payload.images !== undefined
    ? (Array.isArray(payload.images) ? payload.images.filter((u) => typeof u === "string" && u.trim() !== "") : [])
    : [];
  if (images.length === 0 && payload.images === undefined) {
    const { data: imgRows } = await supabaseAdmin.from("repes_listing_images").select("url").eq("listing_id", listingId).order("sort_order", { ascending: true });
    images = (imgRows || []).map((r: { url: string }) => r.url).filter(Boolean);
  }

  const pdfUrls = payload.pdf_urls !== undefined
    ? (Array.isArray(payload.pdf_urls) ? payload.pdf_urls.filter((u) => typeof u === "string" && u.trim() !== "") : [])
    : (() => {
        const u = (listing as { pdf_urls?: string[] }).pdf_urls;
        const single = (listing as { pdf_url?: string }).pdf_url;
        return Array.isArray(u) && u.length > 0 ? u : (single ? [single] : []);
      })();
  const documents = pdfUrls.map((url, i) => ({
    name: pdfUrls.length > 1 ? `Document licitație ${i + 1}` : "Document licitație",
    url,
    type: "pdf" as const,
  }));

  const mainCategory = payload.main_category !== undefined ? payload.main_category : (listing as { main_category?: string }).main_category;
  const subcategoryLabel = payload.category !== undefined ? payload.category : (listing as { category?: string }).category;
  const { category: roCategory, subcategory: roSubcategory } = getRoCategoryAndSubcategoryForRepes(
    mainCategory && String(mainCategory).trim() ? String(mainCategory).trim() : "Imobiliare",
    subcategoryLabel && String(subcategoryLabel).trim() ? String(subcategoryLabel).trim() : ""
  );

  if (images.length === 0) {
    const defaultImg = getCategoryDefaultImageUrl(mainCategory ?? "Imobiliare", subcategoryLabel ?? null);
    if (defaultImg && !defaultImg.includes("no-image-placeholder")) images = [defaultImg];
  }

  const baseSlug = slugify(title) || `executare-${listingId.slice(0, 8)}`;
  const { data: allSlugs } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null).neq("id", productId);
  const existingSlugs = (allSlugs || []).map((p: { slug: string }) => p.slug).filter(Boolean);
  const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

  const meta = (listing as { meta_fields?: Record<string, string> }).meta_fields && typeof (listing as { meta_fields?: unknown }).meta_fields === "object"
    ? (listing as { meta_fields: Record<string, string> }).meta_fields
    : {};
  const pick = (keys: string[]) => {
    const v = keys.map((k) => meta[k]).find((val) => val != null && String(val).trim() !== "");
    return v !== undefined ? String(v).trim() : undefined;
  };

  const productUpdate: Record<string, unknown> = {
    title: title || "Execuție publică",
    description,
    category: roCategory,
    subcategory: roSubcategory,
    starting_price: startingPriceRON,
    starting_price_ron: startingPriceRON,
    starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
    currency: priceCurrency === "EUR" ? "EUR" : "RON",
    county: payload.location_county ?? (listing as { location_county?: string }).location_county ?? null,
    city: payload.location_city ?? (listing as { location_city?: string }).location_city ?? null,
    address: payload.location_raw ?? (listing as { location_raw?: string }).location_raw ?? null,
    auction_date: payload.auction_date ?? (listing as { auction_date?: string }).auction_date ?? null,
    images,
    documents,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
    updated_at: new Date().toISOString(),
    custom_fields: {
      ...existingCustom,
      ...meta,
      Licitator: pick(["Licitator", "Licitator name"]) ?? (listing as { seller_name?: string }).seller_name ?? undefined,
      Email: pick(["Email", "E-mail"]) ?? (listing as { seller_email?: string }).seller_email ?? undefined,
      Telefon: pick(["Telefon", "Telefon (Phone)"]) ?? (listing as { seller_phone?: string }).seller_phone ?? undefined,
      Adresă: pick(["Adresă", "Adresă (Address)"]) ?? (listing as { seller_address?: string }).seller_address ?? undefined,
      price_text: formatPriceTextForDisplayEuropean(priceText) !== "—" ? formatPriceTextForDisplayEuropean(priceText) : (priceText ?? undefined),
      location_raw: payload.location_raw ?? (listing as { location_raw?: string }).location_raw ?? undefined,
      auction_time: payload.auction_time ?? (listing as { auction_time?: string }).auction_time ?? undefined,
      executor_name: (listing as { seller_name?: string }).seller_name ?? undefined,
      executor_email: (listing as { seller_email?: string }).seller_email ?? undefined,
      executor_phone: (listing as { seller_phone?: string }).seller_phone ?? undefined,
      executor_address: (listing as { seller_address?: string }).seller_address ?? undefined,
      source_url: (listing as { source_url?: string }).source_url,
      source_external_id: (listing as { source_external_id?: string }).source_external_id,
      seller_name: (listing as { seller_name?: string }).seller_name ?? undefined,
      imported_from: "repes",
      cod_anunt: getCodAnuntFormat3Litere5CifreE("Executări și Insolvență"),
      main_category: mainCategory ?? undefined,
      listing_main_category: mainCategory ?? undefined,
      listing_category: subcategoryLabel ?? undefined,
    },
  };

  const { error: productUpdateError } = await supabaseAdmin
    .from("products")
    .update(productUpdate)
    .eq("id", productId);

  if (productUpdateError) {
    return NextResponse.json({ success: false, error: productUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    productId,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
  });
}
