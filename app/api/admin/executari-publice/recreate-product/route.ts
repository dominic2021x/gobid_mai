/**
 * POST /api/admin/executari-publice/recreate-product
 * Șterge anunțul (produsul) vechi de pe site și creează unul nou cu titlu, descriere din PDF + listing.
 * Body: { listingId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { getCodAnuntFormat3Litere5CifreE } from "@/lib/licitatii-cod-anunt";
import { extractTextFromPDFUrl } from "@/lib/anaf/pdfExtractor";
import { parseRepesPDFWithGPT } from "@/lib/repes/pdfParser";
import type { RepesPDFExtraction } from "@/lib/repes/pdfParser";
import { getRoCategoryAndSubcategoryForRepes } from "@/lib/data/ro-categories";
import { getCategoryDefaultImageUrl } from "@/lib/getProductDisplayImage";
import { enqueueImageMirrorJobsForProduct } from "@/lib/image-jobs/enqueue";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 180;

const RON_EUR_RATE = 5;
const TOP_CATEGORY = "Executări și Insolvență";
const FALLBACK_MAIN = "Imobiliare";
const FALLBACK_SUBCATEGORY = "executari-publice";
const MAX_SLUG_LENGTH = 80;
const PDF_EXTRACTION_TIMEOUT_MS = 100_000;

function buildDescriptiveSlug(
  title: string,
  locationCounty: string | null,
  locationCity: string | null,
  locationRaw: string | null
): string {
  const parts: string[] = [];
  if (title && title.trim().length >= 2) parts.push(title.trim());
  const loc = [locationCounty, locationCity].filter(Boolean).join("-") || (locationRaw || "").trim();
  if (loc) parts.push(loc);
  const raw = parts.join(" ");
  const slug = slugify(raw).slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  return slug || "executie-publica";
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function isAdminUser(user: { id?: string } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

async function extractFromListingPdf(pdfUrl: string): Promise<RepesPDFExtraction | null> {
  try {
    const extractionPromise = (async () => {
      const out = await extractTextFromPDFUrl(pdfUrl);
      const text = out?.text?.trim() ?? "";
      if (!text) return null;
      return parseRepesPDFWithGPT(text);
    })();
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("PDF extraction timeout")), PDF_EXTRACTION_TIMEOUT_MS)
    );
    return await Promise.race([extractionPromise, timeoutPromise]);
  } catch {
    return null;
  }
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

  const { data: listingRow, error: fetchError } = await supabaseAdmin
    .from("repes_listings")
    .select("*")
    .eq("id", listingId)
    .single();

  if (fetchError || !listingRow) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const listing = listingRow as Record<string, unknown>;
  const oldProductId = listing.product_id as string | null | undefined;
  if (!oldProductId) {
    return NextResponse.json({ error: "Anunțul nu este publicat; folosește Publică pentru a crea produsul." }, { status: 400 });
  }

  await supabaseAdmin.from("repes_listings").update({ product_id: null }).eq("id", listingId);
  await supabaseAdmin.from("products").delete().eq("id", oldProductId);

  const { data: freshRow } = await supabaseAdmin.from("repes_listings").select("*").eq("id", listingId).single();
  const listingFresh = (freshRow ?? listing) as Record<string, unknown>;

  const pdfUrls = (listingFresh.pdf_urls as string[] | undefined);
  const pdfUrl = listingFresh.pdf_url as string | undefined;
  const firstPdf = (Array.isArray(pdfUrls) && pdfUrls.length > 0 ? pdfUrls[0] : null) ?? (pdfUrl && typeof pdfUrl === "string" ? pdfUrl : null);

  let fromPdf: RepesPDFExtraction | null = null;
  if (firstPdf) {
    fromPdf = await extractFromListingPdf(firstPdf);
    if (fromPdf) {
      const updateListing: Record<string, unknown> = {};
      if (fromPdf.description_html) updateListing.description_html = fromPdf.description_html;
      if (fromPdf.title) updateListing.title = fromPdf.title;
      if (fromPdf.location_raw != null) updateListing.location_raw = fromPdf.location_raw;
      if (fromPdf.location_city != null) updateListing.location_city = fromPdf.location_city;
      if (fromPdf.location_county != null) updateListing.location_county = fromPdf.location_county;
      if (fromPdf.price_text != null) updateListing.price_text = fromPdf.price_text;
      if (fromPdf.auction_date != null) updateListing.auction_date = fromPdf.auction_date;
      if (fromPdf.auction_time != null) updateListing.auction_time = fromPdf.auction_time;
      if (fromPdf.meta_fields && Object.keys(fromPdf.meta_fields).length > 0) {
        const existingMeta = (listingFresh.meta_fields as Record<string, string> | undefined) ?? {};
        updateListing.meta_fields = { ...existingMeta, ...fromPdf.meta_fields };
      }
      if (Object.keys(updateListing).length > 0) {
        await supabaseAdmin.from("repes_listings").update(updateListing).eq("id", listingId);
        Object.assign(listingFresh, updateListing);
      }
    }
  }

  const sourceTitle = (listingFresh.title as string) ?? "";
  const locationCounty = (listingFresh.location_county as string) ?? null;
  const locationCity = (listingFresh.location_city as string) ?? null;
  const locationRaw = (listingFresh.location_raw as string) ?? null;
  const priceText = (listingFresh.price_text as string) ?? "";
  const sellerName = (listingFresh.seller_name as string) ?? null;
  const auctionDate = (listingFresh.auction_date as string) ?? null;
  const auctionTime = (listingFresh.auction_time as string) ?? null;
  const descriptionHtml = (listingFresh.description_html as string) ?? "";

  const title =
    (fromPdf?.title && fromPdf.title.trim().length >= 3
      ? fromPdf.title.trim()
      : sourceTitle && sourceTitle.trim().length >= 3
        ? sourceTitle.trim()
        : [sourceTitle.trim(), locationRaw].filter(Boolean).join(" – ") || "Execuție publică");

  const descriptionText = stripHtml(fromPdf?.description_html || descriptionHtml).trim();
  const description =
    descriptionText.length >= 30
      ? descriptionText
      : (() => {
          const parts: string[] = [title];
          if (locationRaw) parts.push(`Locație: ${locationRaw}`);
          if (sellerName) parts.push(`Executor: ${sellerName}`);
          if (auctionDate || auctionTime) parts.push(`Data licitație: ${[auctionDate, auctionTime].filter(Boolean).join(" ")}`);
          if (priceText) parts.push(`Preț: ${priceText}`);
          parts.push("Detalii complete pe sursa oficială REPES.");
          return parts.join(". ");
        })();

  const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice(priceText);
  const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
  const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

  const { data: imgRows } = await supabaseAdmin
    .from("repes_listing_images")
    .select("url")
    .eq("listing_id", listingId)
    .order("sort_order", { ascending: true });
  const rawImages = (imgRows || []).map((r: { url: string }) => r.url).filter(Boolean);
  const mainCategoryForImg = (listingFresh as { main_category?: string | null }).main_category?.trim() || FALLBACK_MAIN;
  const subcategoryForImg = (listingFresh as { category?: string | null }).category?.trim() || FALLBACK_SUBCATEGORY;
  let images =
    rawImages.length > 0
      ? rawImages
      : [getCategoryDefaultImageUrl(mainCategoryForImg, subcategoryForImg)].filter(
          (u) => u && !u.includes("no-image-placeholder")
        );
  const baseSlug = buildDescriptiveSlug(title, locationCounty, locationCity, locationRaw);
  const { data: existingProducts } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null);
  const existingSlugs = (existingProducts || []).map((p: { slug: string }) => p.slug).filter(Boolean);
  const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

  const extId = (listingFresh.source_external_id as string) ?? "";
  const skuRaw = `REPES-${extId.slice(0, 24)}-${listingId.slice(0, 8)}`.replace(/[^A-Za-z0-9-]/g, "-");
  const sku = skuRaw || `REPES-${listingId.slice(0, 12)}`;

  const urls = Array.isArray(pdfUrls) && pdfUrls.length > 0 ? pdfUrls : (pdfUrl ? [pdfUrl] : []);
  const documents = urls.map((url: string, i: number) => ({
    name: `PDF ${i + 1}`,
    url,
    type: "pdf" as const,
  }));

  const meta = (listingFresh.meta_fields as Record<string, string> | undefined) ?? {};
  const pick = (keys: string[]) => {
    const v = keys.map((k) => meta[k]).find((val) => val !== undefined && val !== null && String(val).trim() !== "");
    return v !== undefined ? String(v).trim().replace(/\s+/g, " ") : undefined;
  };

  const mainCategory = (listingFresh as { main_category?: string | null }).main_category?.trim() || FALLBACK_MAIN;
  const subcategory = (listingFresh as { category?: string | null }).category?.trim() || FALLBACK_SUBCATEGORY;

  const { category: roCategory, subcategory: roSubcategory } = getRoCategoryAndSubcategoryForRepes(mainCategory, subcategory);

  const productData = {
    title,
    description,
    category: roCategory,
    subcategory: roSubcategory,
    sku,
    starting_price: startingPriceRON,
    starting_price_ron: startingPriceRON,
    starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
    currency: priceCurrency === "EUR" ? "EUR" : "RON",
    product_type: "licitatii-publice",
    sale_type: "licitatii-insolventa",
    status: "active",
    county: locationCounty,
    city: locationCity,
    address: locationRaw,
    brand: pick(["Marca", "Brand", "marca", "brand"]) ?? null,
    model: pick(["Model", "model"]) ?? null,
    auction_date: auctionDate,
    images,
    documents,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
    custom_fields: {
      ...meta,
      Licitator: pick(["Licitator", "Licitator name"]) ?? (listingFresh.seller_name as string) ?? undefined,
      Email: pick(["Email", "E-mail"]) ?? (listingFresh.seller_email as string) ?? undefined,
      Telefon: pick(["Telefon", "Telefon (Phone)"]) ?? (listingFresh.seller_phone as string) ?? undefined,
      Adresă: pick(["Adresă", "Adresă (Address)"]) ?? (listingFresh.seller_address as string) ?? undefined,
      Fax: pick(["Fax"]),
      "Cod fiscal": pick(["Cod fiscal", "CUI"]),
      Competență: pick(["Competență", "Competență (Jurisdiction/Competence)"]),
      price_text: (() => {
        const raw = listingFresh.price_text as string | undefined;
        const formatted = formatPriceTextForDisplayEuropean(raw);
        return formatted !== "—" ? formatted : (raw ?? undefined);
      })(),
      location_raw: locationRaw ?? undefined,
      auction_time: auctionTime ?? undefined,
      executor_name: (listingFresh.seller_name as string) ?? undefined,
      executor_email: (listingFresh.seller_email as string) ?? undefined,
      executor_phone: (listingFresh.seller_phone as string) ?? undefined,
      executor_address: (listingFresh.seller_address as string) ?? undefined,
      source_url: listingFresh.source_url,
      source_external_id: listingFresh.source_external_id,
      seller_name: (listingFresh.seller_name as string) ?? undefined,
      imported_from: "repes",
      imported_at: new Date().toISOString(),
      cod_anunt: getCodAnuntFormat3Litere5CifreE(TOP_CATEGORY),
      main_category: mainCategory,
      listing_main_category: mainCategory,
      listing_category: subcategory || undefined,
    },
  };

  const { data: product, error: insertError } = await supabaseAdmin
    .from("products")
    .insert(productData as Record<string, unknown>)
    .select("id, slug, url")
    .single();

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  await supabaseAdmin.from("repes_listings").update({ product_id: product.id }).eq("id", listingId);

  if (supabaseAdmin && images.length > 0) {
    await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
      productId: product.id,
      userId: null,
      imageUrls: images,
    });
  }

  return NextResponse.json({
    success: true,
    productId: product.id,
    slug: product.slug,
    url: product.url ?? `/licitatii-publice/${product.slug}`,
  });
}
