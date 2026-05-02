/**
 * POST /api/admin/licitatii-insolventa/regenerate-product
 * Regenerează titlul și descrierea unui produs deja publicat (din listing-ul sursă).
 * Body: { productId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { generateLicitatiiTitleFromDescription, fallbackTitle, paraphraseLicitatiiDescription, extractLicitatiiLocationFromDescription } from "@/lib/ai/licitatii-title-generator";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { getMainCategoryFromSource } from "@/lib/data/licitatii-insolventa-category-map";
import { getCodAnuntFromCategoryAndId } from "@/lib/licitatii-cod-anunt";
import { fetchHtml } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";
import { buildDetailUpdatePayload } from "@/lib/scraper/detailToPayload";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
const RON_EUR_RATE = 5;
export const maxDuration = 60;

/** Formular de înscriere – inclus la toate anunțurile licitații insolvență (fișier în /public). */
const FORMULAR_INSCRIERE_DOC = { name: "Formular de înscriere", url: "/insolventa.pdf", type: "pdf" as const };

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

function combineAuctionDateTime(
  auctionDate: string | null | undefined,
  auctionTime: string | null | undefined
): string | null {
  if (!auctionDate || !auctionDate.trim()) return null;
  const datePart = auctionDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return auctionDate;
  if (!auctionTime || !auctionTime.trim()) return auctionDate;
  const timeTrimmed = auctionTime.trim();
  const timeMatch = timeTrimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!timeMatch) return auctionDate;
  const hours = Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)));
  const minutes = Math.min(59, Math.max(0, parseInt(timeMatch[2], 10)));
  const seconds = timeMatch[3] != null ? Math.min(59, Math.max(0, parseInt(timeMatch[3], 10))) : 0;
  const timePart = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${datePart}T${timePart}`;
}

/** Parse date from meta_fields (e.g. "12/02/2026") to YYYY-MM-DD. */
function parseMetaDateToIso(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = parseInt(d!, 10);
  const month = parseInt(mo!, 10) - 1;
  const year = parseInt(y!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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

  let body: { productId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId;
  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  const { data: listing, error: listError } = await supabaseAdmin
    .from("licitatii_insolventa_listings")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();

  if (listError || !listing) {
    return NextResponse.json({ error: "Listing not found for this product" }, { status: 404 });
  }

  let descriptionHtml = listing.description_html ?? "";
  let sourceTitle = listing.title ?? "";
  let county = listing.location_county ?? null;
  let city = listing.location_city ?? null;
  let categorySource = listing.category ?? "";

  if (!descriptionHtml || descriptionHtml.trim().length < 50) {
    const sourceUrl = (listing.source_url as string) || "";
    if (sourceUrl) {
      try {
        const html = await fetchHtml(sourceUrl);
        const detail = parseDetailPage(html, sourceUrl);
        const { update } = buildDetailUpdatePayload(detail);
        const detailDesc = (detail.descriptionHtml ?? (update.description_html as string) ?? "").trim();
        if (detailDesc.length > 0) {
          await supabaseAdmin
            .from("licitatii_insolventa_listings")
            .update({
              description_html: detailDesc,
              title: (detail.title || (update.title as string)) ?? undefined,
              category: (detail.category ?? (update.category as string)) ?? undefined,
              location_county: (update.location_county as string) ?? undefined,
              location_city: (update.location_city as string) ?? undefined,
              auction_date: (update.auction_date as string) ?? undefined,
              auction_time: (update.auction_time as string) ?? undefined,
              meta_fields: (update.meta_fields as Record<string, string> | undefined) ?? undefined,
              seller_email: (update.seller_email as string) ?? undefined,
              seller_phone: (update.seller_phone as string) ?? undefined,
              seller_address: (update.seller_address as string) ?? undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("id", listing.id);
          (listing as Record<string, unknown>).seller_email = update.seller_email ?? (listing as Record<string, unknown>).seller_email;
          (listing as Record<string, unknown>).seller_phone = update.seller_phone ?? (listing as Record<string, unknown>).seller_phone;
          (listing as Record<string, unknown>).seller_address = update.seller_address ?? (listing as Record<string, unknown>).seller_address;
          if ((update.auction_date as string)?.trim()) (listing as Record<string, unknown>).auction_date = update.auction_date;
          if ((update.auction_time as string)?.trim()) (listing as Record<string, unknown>).auction_time = update.auction_time;
          if (update.meta_fields && typeof update.meta_fields === "object") (listing as Record<string, unknown>).meta_fields = update.meta_fields;
          descriptionHtml = detailDesc;
          if ((detail.title || (update.title as string))?.trim()) sourceTitle = (detail.title || (update.title as string)).trim();
          if ((detail.category || (update.category as string))?.trim()) categorySource = (detail.category || (update.category as string)).trim();
          if ((update.location_county as string)?.trim()) county = (update.location_county as string).trim();
          if ((update.location_city as string)?.trim()) city = (update.location_city as string).trim();
        }
      } catch (e) {
        console.warn("[regenerate-product] fetch detail for description failed:", e);
      }
    }
  }

  let descriptionText = stripHtml(descriptionHtml).trim();
  if (!descriptionText || descriptionText.length < 20) {
    const parts = [sourceTitle, categorySource, county, city].filter(Boolean);
    descriptionText = parts.join(". ") || "Licitație publică.";
    const { data: existingProduct } = await supabaseAdmin.from("products").select("title, description").eq("id", productId).maybeSingle();
    if (existingProduct?.title || existingProduct?.description) {
      const fromProduct = [existingProduct.title, (existingProduct.description || "").slice(0, 500)].filter(Boolean).join(" ");
      if (fromProduct.trim().length > descriptionText.length) descriptionText = fromProduct.trim();
    }
  }

  let title = await generateLicitatiiTitleFromDescription({
    descriptionText,
    sourceTitle,
    category: categorySource,
    county,
    city,
  });
  if (!title) title = fallbackTitle(sourceTitle, descriptionText);

  let description = await paraphraseLicitatiiDescription(descriptionText, title);
  if (!description) description = descriptionText || "Descriere licitație.";

  const locatieBunuri = await extractLicitatiiLocationFromDescription(descriptionText);

  const baseSlug = slugify(title) || `licitatie-${listing.id.slice(0, 8)}`;
  const { data: existingProducts } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null).neq("id", productId);
  const existingSlugs = (existingProducts || []).map((p: { slug: string }) => p.slug).filter(Boolean);
  const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

  const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice(listing.price_text);
  const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
  const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

  const { data: currentProduct } = await supabaseAdmin.from("products").select("custom_fields").eq("id", productId).maybeSingle();
  const baseCustomFields = (currentProduct?.custom_fields && typeof currentProduct.custom_fields === "object") ? currentProduct.custom_fields : {};
  const formattedPriceText = formatPriceTextForDisplayEuropean(listing.price_text);

  const pdfUrlsForCf = Array.isArray((listing as { pdf_urls?: string[] }).pdf_urls)
    ? (listing as { pdf_urls: string[] }).pdf_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const listingAny = listing as { seller_name?: string; seller_email?: string; seller_phone?: string; seller_address?: string };
  const meta = listing.meta_fields && typeof listing.meta_fields === "object" ? (listing.meta_fields as Record<string, string>) : {};
  const dataLicitatie2 = meta["Data licitatie 2"] ?? meta["data_licitatie_2"];
  const oraLicitatie2 = meta["Ora licitatie 2"] ?? meta["ora_licitatie_2"];
  const mainCategory = getMainCategoryFromSource(categorySource, sourceTitle, descriptionText);
  const custom_fields = {
    ...baseCustomFields,
    executor_name: listingAny.seller_name ?? (baseCustomFields as any).executor_name,
    executor_email: listingAny.seller_email ?? (baseCustomFields as any).executor_email,
    executor_phone: listingAny.seller_phone ?? (baseCustomFields as any).executor_phone,
    executor_address: listingAny.seller_address ?? (baseCustomFields as any).executor_address,
    price_text: formattedPriceText !== "—" ? formattedPriceText : (listing.price_text ?? (baseCustomFields as any).price_text),
    ...(locatieBunuri != null ? { locatie_bunuri: locatieBunuri } : {}),
    ...(pdfUrlsForCf.length > 0 ? { pdf_urls: pdfUrlsForCf } : {}),
    ...(dataLicitatie2 != null ? { data_licitatie_2: dataLicitatie2 } : {}),
    ...(oraLicitatie2 != null ? { ora_licitatie_2: oraLicitatie2 } : {}),
    ...(meta["Licitatie orice zi"] === "da" ? { auction_rolling_daily: true } : {}),
    cod_anunt: getCodAnuntFromCategoryAndId(mainCategory, listing.source_external_id),
  };

  const auctionDateCombined = (() => {
    const combined = combineAuctionDateTime(listing.auction_date, listing.auction_time) ?? listing.auction_date ?? null;
    if (combined) return combined;
    const meta = listing.meta_fields && typeof listing.meta_fields === "object" ? (listing.meta_fields as Record<string, string>) : {};
    const data2 = meta["Data licitatie 2"] ?? meta["data_licitatie_2"];
    const ora2 = meta["Ora licitatie 2"] ?? meta["ora_licitatie_2"];
    if (data2) {
      const iso = parseMetaDateToIso(data2);
      return combineAuctionDateTime(iso, ora2) ?? iso;
    }
    return null;
  })();

  const pdfUrls = Array.isArray((listing as { pdf_urls?: string[] }).pdf_urls)
    ? (listing as { pdf_urls: string[] }).pdf_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const listingDocs =
    pdfUrls.length > 0
      ? pdfUrls.map((url, idx) => ({
          name: pdfUrls.length > 1 ? `Document licitație ${idx + 1}` : "Document licitație",
          url,
          type: "pdf",
        }))
      : listing.pdf_url
        ? [{ name: "Document licitație", url: listing.pdf_url, type: "pdf" }]
        : [];
  const documents = [FORMULAR_INSCRIERE_DOC, ...listingDocs.filter((d) => d.url !== FORMULAR_INSCRIERE_DOC.url)];

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({
      title,
      description,
      slug: uniqueSlug,
      url: `/licitatii-publice/${uniqueSlug}`,
      starting_price: startingPriceRON,
      starting_price_ron: startingPriceRON,
      starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
      currency: priceCurrency === "EUR" ? "EUR" : "RON",
      ...(auctionDateCombined != null ? { auction_date: auctionDateCombined } : {}),
      documents,
      custom_fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    productId,
    slug: uniqueSlug,
    url: `/licitatii-publice/${uniqueSlug}`,
    title,
  });
}
