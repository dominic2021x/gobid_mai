/**
 * POST /api/admin/executari-publice/publish
 * Publică un listing REPES pe site (creează produs în products).
 * Body: { listingId: string } sau { listingIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { getCodAnuntFormat3Litere5CifreE } from "@/lib/licitatii-cod-anunt";
import { enqueueImageMirrorJobsForProduct } from "@/lib/image-jobs/enqueue";
import { extractTextFromPDFUrl } from "@/lib/anaf/pdfExtractor";
import { parseRepesPDFWithGPT } from "@/lib/repes/pdfParser";
import type { RepesPDFExtraction } from "@/lib/repes/pdfParser";
import { inferRepesCategories } from "@/lib/repes/inferCategories";
import { getRoCategoryAndSubcategoryForRepes } from "@/lib/data/ro-categories";
import { getCategoryDefaultImageUrl } from "@/lib/getProductDisplayImage";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 180;

const RON_EUR_RATE = 5;

const TOP_CATEGORY = "Executări și Insolvență";
const FALLBACK_MAIN = "Imobiliare";
const FALLBACK_SUBCATEGORY = "executari-publice";
const MAX_SLUG_LENGTH = 80;

/** Slug descriptiv din titlu + locație (ca la licitații publice). */
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

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
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

const PDF_EXTRACTION_TIMEOUT_MS = 100_000;

/** Extrage date din primul PDF al listing-ului; returnează null la timeout sau eroare. */
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
  const secret = request.headers.get("x-sync-secret");
  const envSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get("authorization");
  let allowed = false;
  if (envSecret && secret === envSecret) {
    allowed = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
      if (await isAdminUser(user)) allowed = true;
    } catch {
      // ignore
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let body: { listingId?: string; listingIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: string[] = body.listingIds?.length ? body.listingIds : body.listingId ? [body.listingId] : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Missing listingId or listingIds" }, { status: 400 });
  }

  const results: { listingId: string; success: boolean; productId?: string; slug?: string; url?: string; alreadyPublished?: boolean; error?: string }[] = [];

  for (const listingId of ids) {
    const { data: listing, error: listError } = await supabaseAdmin
      .from("repes_listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (listError || !listing) {
      results.push({ listingId, success: false, error: "Not found" });
      continue;
    }

    const existingProductId = (listing as { product_id?: string | null }).product_id;
    if (existingProductId) {
      const { data: prod } = await supabaseAdmin.from("products").select("id, slug, url").eq("id", existingProductId).single();
      results.push({
        listingId,
        success: true,
        alreadyPublished: true,
        productId: prod?.id,
        slug: prod?.slug ?? undefined,
        url: prod?.url ?? (prod?.slug ? `/licitatii-publice/${prod.slug}` : undefined),
      });
      continue;
    }

    const pdfUrls = (listing as { pdf_urls?: string[] }).pdf_urls;
    const pdfUrl = (listing as { pdf_url?: string }).pdf_url;
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
          const existingMeta = (listing as { meta_fields?: Record<string, string> }).meta_fields ?? {};
          updateListing.meta_fields = { ...existingMeta, ...fromPdf.meta_fields };
        }
        if (Object.keys(updateListing).length > 0) {
          await supabaseAdmin.from("repes_listings").update(updateListing).eq("id", listingId);
          Object.assign(listing, updateListing);
        }
      }
    }

    const sourceTitle = (listing as { title?: string }).title ?? "";
    const locationCounty = (listing as { location_county?: string }).location_county ?? null;
    const locationCity = (listing as { location_city?: string }).location_city ?? null;
    const locationRaw = (listing as { location_raw?: string }).location_raw ?? null;
    const priceText = (listing as { price_text?: string }).price_text ?? "";
    const sellerName = (listing as { seller_name?: string }).seller_name ?? null;
    const auctionDate = (listing as { auction_date?: string }).auction_date ?? null;
    const auctionTime = (listing as { auction_time?: string }).auction_time ?? null;
    const descriptionHtml = (listing as { description_html?: string }).description_html ?? "";

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

    let images: { url: string }[] = [];
    const { data: imgRows } = await supabaseAdmin
      .from("repes_listing_images")
      .select("url")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });
    if (imgRows?.length) images = imgRows as { url: string }[];

    const baseSlug = buildDescriptiveSlug(title, locationCounty, locationCity, locationRaw);
    // Sufix unic din listing id ca să evităm duplicate key la titluri identice (ex. mai multe "Teren extravilan, Avrig, Sibiu")
    const slugSuffix = listingId.replace(/-/g, "").slice(0, 8);
    const baseSlugWithId = baseSlug ? `${baseSlug}-${slugSuffix}` : `executie-publica-${slugSuffix}`;
    const { data: existingProducts } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null).limit(20000);
    const existingSlugs = (existingProducts || []).map((p: { slug: string }) => p.slug).filter(Boolean);
    const uniqueSlug = generateUniqueSlug(baseSlugWithId, existingSlugs);

    const extId = (listing as { source_external_id?: string }).source_external_id ?? "";
    const skuRaw = `REPES-${extId.slice(0, 24)}-${listingId.slice(0, 8)}`.replace(/[^A-Za-z0-9-]/g, "-");
    const sku = skuRaw || `REPES-${listingId.slice(0, 12)}`;

    const urls = Array.isArray(pdfUrls) && pdfUrls.length > 0 ? pdfUrls : (pdfUrl ? [pdfUrl] : []);
    const documents = urls.map((url, i) => ({
      name: `PDF ${i + 1}`,
      url,
      type: "pdf" as const,
    }));

    // La publicare: completează automat categorii dacă lipsesc (inferență din titlu + descriere)
    let mainCategory = (listing as { main_category?: string | null }).main_category?.trim() || null;
    let subcategory = (listing as { category?: string | null }).category?.trim() || null;
    if (!mainCategory) {
      const inferred = inferRepesCategories(title, description);
      mainCategory = inferred.main_category;
      subcategory = inferred.category ?? null;
      await supabaseAdmin.from("repes_listings").update({ main_category: mainCategory, category: subcategory }).eq("id", listingId);
      Object.assign(listing, { main_category: mainCategory, category: subcategory });
    }
    if (!subcategory) subcategory = FALLBACK_SUBCATEGORY;
    mainCategory = mainCategory || FALLBACK_MAIN;

    // Ca la Licitații publice: category + subcategory pentru /ro ca anunțul să apară și la Executări și la categoria principală (Imobiliare > Terenuri etc.)
    const { category: roCategory, subcategory: roSubcategory } = getRoCategoryAndSubcategoryForRepes(mainCategory, subcategory);

    // Dacă anunțul nu are poze, folosim imaginea din categoria personalizată (implicită pentru categorie/subcategorie)
    let imageUrls =
      images.length > 0
        ? images.map((i) => i.url).filter(Boolean)
        : [getCategoryDefaultImageUrl(mainCategory, subcategory)].filter((u) => u && !u.includes("no-image-placeholder"));
    const meta = (listing as { meta_fields?: Record<string, string> }).meta_fields;
    const metaObj = meta && typeof meta === "object" ? meta : {};
    const pickMeta = (keys: string[]) => {
      const v = keys.map((k) => metaObj[k]).find((val) => val !== undefined && val !== null && String(val).trim() !== "");
      return v !== undefined ? String(v).trim().replace(/\s+/g, " ") : null;
    };
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
      county: (listing as { location_county?: string }).location_county ?? null,
      city: (listing as { location_city?: string }).location_city ?? null,
      address: (listing as { location_raw?: string }).location_raw ?? null,
      auction_date: (listing as { auction_date?: string }).auction_date ?? null,
      brand: pickMeta(["Marca", "Brand", "marca", "brand"]) ?? null,
      model: pickMeta(["Model", "model"]) ?? null,
      images: imageUrls,
      documents,
      slug: uniqueSlug,
      url: `/licitatii-publice/${uniqueSlug}`,
      custom_fields: (() => {
        const meta = (listing as { meta_fields?: Record<string, string> }).meta_fields;
        const metaObj = meta && typeof meta === "object" ? meta : {};
        const pick = (keys: string[]) => {
          const v = keys.map((k) => metaObj[k]).find((val) => val !== undefined && val !== null && String(val).trim() !== "");
          return v !== undefined ? String(v).trim() : undefined;
        };
        return {
          ...metaObj,
          // Detalii din anunț (tabel site) – chei explicite pentru business card (frontend citește Licitator, Email, Telefon, Adresă)
          Licitator: pick(["Licitator", "Licitator name"]) ?? (listing as { seller_name?: string }).seller_name ?? undefined,
          Email: pick(["Email", "E-mail"]) ?? (listing as { seller_email?: string }).seller_email ?? undefined,
          Telefon: pick(["Telefon", "Telefon (Phone)"]) ?? (listing as { seller_phone?: string }).seller_phone ?? undefined,
          Adresă: pick(["Adresă", "Adresă (Address)"]) ?? (listing as { seller_address?: string }).seller_address ?? undefined,
          Fax: pick(["Fax"]),
          "Cod fiscal": pick(["Cod fiscal", "CUI"]),
          Competență: pick(["Competență", "Competență (Jurisdiction/Competence)"]),
          price_text: (() => {
            const raw = (listing as { price_text?: string }).price_text;
            const formatted = formatPriceTextForDisplayEuropean(raw);
            return formatted !== "—" ? formatted : (raw ?? undefined);
          })(),
          location_raw: (listing as { location_raw?: string }).location_raw ?? undefined,
          auction_time: (listing as { auction_time?: string }).auction_time ?? undefined,
          executor_name: (listing as { seller_name?: string }).seller_name ?? undefined,
          executor_email: (listing as { seller_email?: string }).seller_email ?? undefined,
          executor_phone: (listing as { seller_phone?: string }).seller_phone ?? undefined,
          executor_address: (listing as { seller_address?: string }).seller_address ?? undefined,
          source_url: (listing as { source_url?: string }).source_url,
          source_external_id: (listing as { source_external_id?: string }).source_external_id,
          seller_name: (listing as { seller_name?: string }).seller_name ?? undefined,
          imported_from: "repes",
          imported_at: new Date().toISOString(),
          cod_anunt: getCodAnuntFormat3Litere5CifreE(TOP_CATEGORY),
          main_category: mainCategory,
          // Același model ca Licitații publice, ca pe /ro să apară la fel (fără cod nou pe /ro)
          listing_main_category: mainCategory,
          listing_category: subcategory || undefined, // eticheta REPES pentru filtre Executări
        };
      })(),
    };

    let product: { id: string; slug: string; url?: string } | null = null;
    let insertError: { message: string } | null = null;
    let currentSlug = uniqueSlug;
    let productPayload = { ...productData, slug: currentSlug, url: `/licitatii-publice/${currentSlug}` };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabaseAdmin
        .from("products")
        .insert(productPayload as Record<string, unknown>)
        .select("id, slug, url")
        .single();
      insertError = res.error as { message: string } | null;
      if (!insertError) {
        product = res.data as { id: string; slug: string; url?: string };
        break;
      }
      const isDuplicateSlug = insertError?.message?.includes("slug") && (insertError?.message?.includes("unique") || insertError?.message?.includes("duplicate"));
      if (!isDuplicateSlug || attempt === 2) break;
      existingSlugs.push(currentSlug);
      currentSlug = generateUniqueSlug(baseSlugWithId, existingSlugs);
      productPayload = { ...productData, slug: currentSlug, url: `/licitatii-publice/${currentSlug}` };
    }

    if (insertError || !product) {
      results.push({ listingId, success: false, error: insertError?.message ?? "Insert failed" });
      continue;
    }

    await supabaseAdmin.from("repes_listings").update({ product_id: product.id }).eq("id", listingId);

    if (supabaseAdmin && imageUrls.length > 0) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: product.id,
        userId: null,
        imageUrls,
      });
    }

    results.push({
      listingId,
      success: true,
      productId: product.id,
      slug: product.slug,
      url: product.url ?? `/licitatii-publice/${product.slug}`,
    });
  }

  return NextResponse.json({ success: true, results });
}
