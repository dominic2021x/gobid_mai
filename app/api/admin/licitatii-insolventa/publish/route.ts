/**
 * POST /api/admin/licitatii-insolventa/publish
 * Publică un listing licitatii-insolventa pe site (creează produs în products).
 * Body: { listingId: string } sau { listingIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { generateLicitatiiTitleFromDescription, fallbackTitle, paraphraseLicitatiiDescription, extractLicitatiiLocationFromDescription } from "@/lib/ai/licitatii-title-generator";
import {
  resolveCategoryFromSource,
  resolveCategoryFromSourceWithTitleDescription,
  resolveCategoryFromSourceWithFallback,
  resolvedFromDetectCategoryResponse,
  getMainCategoryFromSource,
  type ResolvedCategory,
} from "@/lib/data/licitatii-insolventa-category-map";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { getCodAnuntFromCategoryAndId } from "@/lib/licitatii-cod-anunt";
import { fetchHtml } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";
import { buildDetailUpdatePayload } from "@/lib/scraper/detailToPayload";
import { enqueueImageMirrorJobsForProduct } from "@/lib/image-jobs/enqueue";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 120;

const RON_EUR_RATE = 5;

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

/**
 * Combină data licitației (auction_date) cu ora (auction_time) într-un singur ISO string
 * pentru a evita afișarea orei 00:00 pe site când ora este stocată separat.
 */
function combineAuctionDateTime(
  auctionDate: string | null | undefined,
  auctionTime: string | null | undefined
): string | null {
  if (!auctionDate || !auctionDate.trim()) return null;
  const datePart = auctionDate.trim().slice(0, 10); // YYYY-MM-DD
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

/** Parse date from meta_fields (e.g. "12/02/2026") to YYYY-MM-DD for combineAuctionDateTime. */
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

async function detectCategoryWithApi(text: string): Promise<ResolvedCategory | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/detect-category`, {
      method: "POST",
      body: JSON.stringify({ text: text.slice(0, 3000) }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.category && data.subcategory) return resolvedFromDetectCategoryResponse(data);
  } catch (e) {
    console.warn("[publish] detect-category fetch failed:", e);
  }
  return null;
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

  let body: { listingId?: string; listingIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: string[] = body.listingIds?.length
    ? body.listingIds
    : body.listingId
      ? [body.listingId]
      : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Missing listingId or listingIds" }, { status: 400 });
  }

  const results: { listingId: string; success: boolean; productId?: string; slug?: string; url?: string; alreadyPublished?: boolean; error?: string }[] = [];

  for (const listingId of ids) {
    const { data: listing, error: listError } = await supabaseAdmin
      .from("licitatii_insolventa_listings")
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

    let imagesData = await supabaseAdmin
      .from("licitatii_insolventa_listing_images")
      .select("id, url, sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });
    let images = imagesData.data ?? [];

    let descriptionHtml = listing.description_html ?? "";
    let sourceTitle = listing.title ?? "";
    let categorySource = listing.category ?? "";
    let county = listing.location_county ?? null;
    let city = listing.location_city ?? null;
    let didFetchDetail = false;

    if (!descriptionHtml || descriptionHtml.trim().length < 50) {
      const sourceUrl = (listing.source_url as string) || "";
      if (sourceUrl) {
        try {
          const html = await fetchHtml(sourceUrl);
          const detail = parseDetailPage(html, sourceUrl);
          const { update, imageUrls: detailImageUrls } = buildDetailUpdatePayload(detail);
          const detailDesc = (detail.descriptionHtml ?? (update.description_html as string) ?? "").trim();
          if (detailDesc.length > 0) {
            await supabaseAdmin
              .from("licitatii_insolventa_listings")
              .update({
                description_html: detailDesc,
                title: (update.title as string) ?? undefined,
                category: (update.category as string) ?? undefined,
                location_county: (update.location_county as string) ?? undefined,
                location_city: (update.location_city as string) ?? undefined,
                location_raw: (update.location_raw as string) ?? undefined,
                pdf_url: (update.pdf_url as string) ?? undefined,
                pdf_urls: (update.pdf_urls as string[] | undefined),
                auction_date: (update.auction_date as string) ?? undefined,
                auction_time: (update.auction_time as string) ?? undefined,
                meta_fields: (update.meta_fields as Record<string, string> | undefined) ?? undefined,
                seller_email: (update.seller_email as string) ?? undefined,
                seller_phone: (update.seller_phone as string) ?? undefined,
                seller_address: (update.seller_address as string) ?? undefined,
                updated_at: new Date().toISOString(),
              })
              .eq("id", listingId);
            (listing as Record<string, unknown>).seller_email = update.seller_email ?? (listing as Record<string, unknown>).seller_email;
            (listing as Record<string, unknown>).seller_phone = update.seller_phone ?? (listing as Record<string, unknown>).seller_phone;
            (listing as Record<string, unknown>).seller_address = update.seller_address ?? (listing as Record<string, unknown>).seller_address;
            if (update.meta_fields && typeof update.meta_fields === "object") (listing as Record<string, unknown>).meta_fields = update.meta_fields;
            descriptionHtml = detailDesc;
            if ((detail.title || (update.title as string))?.trim()) sourceTitle = (detail.title || (update.title as string)).trim();
            if ((detail.category || (update.category as string))?.trim()) categorySource = (detail.category || (update.category as string)).trim();
            if ((update.location_county as string)?.trim()) county = (update.location_county as string).trim();
            if ((update.location_city as string)?.trim()) city = (update.location_city as string).trim();
            didFetchDetail = true;
          }
          if (detailImageUrls.length > 0) {
            const { data: existingImages } = await supabaseAdmin.from("licitatii_insolventa_listing_images").select("id").eq("listing_id", listingId);
            if (!existingImages?.length) {
              const imageRows = detailImageUrls.map((url, i) => ({ listing_id: listingId, url, sort_order: i }));
              await supabaseAdmin.from("licitatii_insolventa_listing_images").insert(imageRows);
            }
            didFetchDetail = true;
          }
        } catch (e) {
          console.warn("[publish] fetch detail for description failed:", e);
        }
      }
    }

    let descriptionText = stripHtml(descriptionHtml).trim();
    const hasRealDescription = descriptionText.length >= 30;
    if (!hasRealDescription) {
      descriptionText = [sourceTitle, categorySource, county, city].filter(Boolean).join(" – ") || "Licitație publică";
      if (descriptionText.length < 20) descriptionText += ". Detalii pe anunțul sursă.";
    }

    if (didFetchDetail) {
      const re = await supabaseAdmin.from("licitatii_insolventa_listing_images").select("id, url, sort_order").eq("listing_id", listingId).order("sort_order", { ascending: true });
      images = re.data ?? [];
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

    const mainCategory = getMainCategoryFromSource(categorySource, sourceTitle, descriptionText);
    let resolvedCat: ResolvedCategory;
    if (mainCategory === "Oferte grupate") {
      resolvedCat = { category: "Oferte grupate", subcategory: "oferte-grupate" };
    } else {
      resolvedCat = resolveCategoryFromSourceWithTitleDescription(
        categorySource,
        sourceTitle,
        descriptionText
      );
      const fromMap = resolveCategoryFromSource(categorySource);
      if (!fromMap && descriptionText.length >= 20 && resolvedCat.subcategory === "bunuri-confiscate") {
        const fromAi = await detectCategoryWithApi(`${sourceTitle}\n\n${descriptionText}`);
        if (fromAi) resolvedCat = fromAi;
      }
    }

    const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice(listing.price_text);
    const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
    const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

    const imageUrls = (images || []).map((img: { url: string }) => img.url).filter(Boolean);

    const baseSlug = slugify(title) || `licitatie-${listingId.slice(0, 8)}`;
    const { data: existingProducts } = await supabaseAdmin.from("products").select("slug").not("slug", "is", null);
    const existingSlugs = (existingProducts || []).map((p: { slug: string }) => p.slug).filter(Boolean);
    const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

    const sku = `INSOLV-${listing.source_external_id?.slice(0, 20) || listingId.slice(0, 8)}`.replace(/[^A-Za-z0-9-]/g, "-");

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

    const norm = (v: unknown) => (v != null && String(v).trim() ? String(v).trim().replace(/\s+/g, " ") : null);
    const productData = {
      title,
      description,
      category: resolvedCat.category,
      subcategory: resolvedCat.subcategory,
      sku,
      starting_price: startingPriceRON,
      starting_price_ron: startingPriceRON,
      starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
      currency: priceCurrency === "EUR" ? "EUR" : "RON",
      product_type: "licitatii-publice",
      sale_type: "licitatii-insolventa",
      status: "active",
      county,
      city,
      address: listing.location_raw ?? null,
      brand: norm((listing as { info_marca?: string }).info_marca) ?? null,
      model: norm((listing as { info_model?: string }).info_model) ?? null,
      auction_date: (() => {
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
      })(),
      images: imageUrls.length ? imageUrls : [],
      documents,
      slug: uniqueSlug,
      url: `/licitatii-publice/${uniqueSlug}`,
      custom_fields: (() => {
        const meta = listing.meta_fields && typeof listing.meta_fields === "object" ? (listing.meta_fields as Record<string, string>) : {};
        const dataLicitatie2 = meta["Data licitatie 2"] ?? meta["data_licitatie_2"];
        const oraLicitatie2 = meta["Ora licitatie 2"] ?? meta["ora_licitatie_2"];
        return {
        // Preț în format european pe site (punct = mii, virgulă = zecimale: 120.447,00 EUR)
        price_text: (() => { const f = formatPriceTextForDisplayEuropean(listing.price_text); return f !== "—" ? f : (listing.price_text ?? undefined); })(),
        location_raw: listing.location_raw ?? undefined,
        locatie_bunuri: locatieBunuri ?? undefined,
        sale_type: listing.sale_type ?? undefined,
        auction_time: listing.auction_time ?? oraLicitatie2 ?? undefined,
        ...(dataLicitatie2 != null ? { data_licitatie_2: dataLicitatie2 } : {}),
        ...(oraLicitatie2 != null ? { ora_licitatie_2: oraLicitatie2 } : {}),
        marca: (listing as any).info_marca ?? undefined,
        kilometraj: (listing as any).info_km ?? undefined,
        combustibil: (listing as any).info_combustibil ?? undefined,
        an: (listing as any).info_an_fabricatie ?? undefined,
        capacitate_cilindrica: (listing as any).info_capacitate_cilindrica ?? undefined,
        // Detalii vânzător (afișate în ExecutorBusinessCard pe pagina produs)
        executor_name: (listing as { seller_name?: string }).seller_name ?? undefined,
        executor_email: (listing as { seller_email?: string }).seller_email ?? undefined,
        executor_phone: (listing as { seller_phone?: string }).seller_phone ?? undefined,
        executor_address: (listing as { seller_address?: string }).seller_address ?? undefined,
        // Metadata tehnică (exclusă din afișare pe anunț)
        source_url: listing.source_url,
        source_external_id: listing.source_external_id,
        seller_name: listing.seller_name ?? undefined,
        imported_from: "licitatii_insolventa",
        imported_at: new Date().toISOString(),
        // Pentru filtre /ro: Cat. principală + Categorie (Executări și Insolvență)
        listing_main_category: mainCategory,
        listing_category: categorySource || undefined,
        ...(pdfUrls.length > 0 ? { pdf_urls: pdfUrls } : {}),
        // „În orice zi” → ceas 24h, se resetează la 00:00
        ...(meta["Licitatie orice zi"] === "da" ? { auction_rolling_daily: true } : {}),
        // „În fiecare vineri” etc. → frontend poate recalcula următoarea zi a săptămânii când data trece
        ...(meta["Licitatie saptamanal"] ? { auction_rolling_weekly: meta["Licitatie saptamanal"] } : {}),
        cod_anunt: getCodAnuntFromCategoryAndId(mainCategory, listing.source_external_id),
        };
      })(),
    };

    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert(productData as any)
      .select("id, slug, url")
      .single();

    if (insertError) {
      results.push({ listingId, success: false, error: insertError.message });
      continue;
    }

    await supabaseAdmin
      .from("licitatii_insolventa_listings")
      .update({ product_id: product.id })
      .eq("id", listingId);

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
