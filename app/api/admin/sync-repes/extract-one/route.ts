/**
 * POST – extrage un singur produs de test de pe REPES (prima pagină, primul anunț).
 * Returnează ce s-a extras (listă + detaliu) și inserează în repes_listings pentru verificare.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { fetchRepesHtmlWithBrowser, delay } from "@/lib/scraper-repes/http";
import { parseRepesListingPage } from "@/lib/scraper-repes/parseListing";
import { parseRepesDetailPage } from "@/lib/scraper-repes/parseDetail";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_LISTING_URL = "https://prod.executori.ro/repes";

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

  try {
    const html = await fetchRepesHtmlWithBrowser(BASE_LISTING_URL);
    await delay(500);

    const cards = parseRepesListingPage(html, BASE_LISTING_URL);
    if (cards.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Nu s-au găsit carduri pe prima pagină după încărcare cu browser.",
        extractedFromList: null,
        extractedFromDetail: null,
        listing: null,
      });
    }

    const externalIds = cards.map((c) => c.externalId).filter(Boolean);
    const { data: existingRows } = await supabaseAdmin
      .from("repes_listings")
      .select("source_external_id, updated_at")
      .in("source_external_id", externalIds);

    const byExternalId = new Map<string | null, string>(
      (existingRows ?? []).map((r: { source_external_id: string; updated_at: string }) => [r.source_external_id, r.updated_at])
    );

    const sorted = [...cards].sort((a, b) => {
      const aInDb = byExternalId.has(a.externalId);
      const bInDb = byExternalId.has(b.externalId);
      if (!aInDb && bInDb) return -1;
      if (aInDb && !bInDb) return 1;
      if (!aInDb && !bInDb) return 0;
      const aUpdated = byExternalId.get(a.externalId) ?? "";
      const bUpdated = byExternalId.get(b.externalId) ?? "";
      return aUpdated.localeCompare(bUpdated);
    });

    const first = sorted[0];
    const extractedFromList = {
      externalId: first.externalId,
      detailUrl: first.detailUrl,
      title: first.title,
      priceText: first.priceText,
      locationRaw: first.locationRaw,
      timeLeft: first.timeLeft,
      publishDate: first.publishDate,
      guarantee: first.guarantee,
      thumbnailsCount: first.thumbnails?.length ?? 0,
    };

    const detailHtml = await fetchRepesHtmlWithBrowser(first.detailUrl);
    await delay(500);
    const detail = parseRepesDetailPage(detailHtml, first.detailUrl);

    const extractedFromDetail = {
      title: detail.title,
      priceText: detail.priceText,
      locationRaw: detail.locationRaw,
      descriptionLength: detail.descriptionHtml?.length ?? 0,
      sellerName: detail.sellerName,
      sellerEmail: detail.sellerEmail,
      sellerPhone: detail.sellerPhone,
      pdfUrl: detail.pdfUrl ? "da" : "nu",
      auctionDate: detail.auctionDate,
      auctionTime: detail.auctionTime,
      imageUrlsCount: detail.imageUrls?.length ?? 0,
      metaFieldsKeys: detail.metaFields ? Object.keys(detail.metaFields) : [],
    };

    const nowIso = new Date().toISOString();
    const auctionDate = detail.auctionDate && detail.auctionTime
      ? `${detail.auctionDate}T${detail.auctionTime}:00`
      : detail.auctionDate;

    const formattedPriceText = detail.priceText ? formatPriceTextForDisplayEuropean(detail.priceText) : null;
    const priceTextToSave = formattedPriceText && formattedPriceText !== "—" ? formattedPriceText : detail.priceText;

    const { data: existing } = await supabaseAdmin
      .from("repes_listings")
      .select("id")
      .eq("source_external_id", first.externalId)
      .maybeSingle();

    let listingId: string | null = null;

    if (existing) {
      await supabaseAdmin
        .from("repes_listings")
        .update({
          title: detail.title,
          price_text: priceTextToSave,
          location_raw: detail.locationRaw,
          description_html: detail.descriptionHtml,
          seller_name: detail.sellerName,
          seller_email: detail.sellerEmail,
          seller_phone: detail.sellerPhone,
          seller_address: detail.sellerAddress,
          pdf_url: detail.pdfUrl,
          pdf_urls: detail.pdfUrls?.length ? detail.pdfUrls : [],
          auction_date: auctionDate || null,
          auction_time: detail.auctionTime,
          meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : null,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existing.id);
      listingId = existing.id;

      const { data: oldImages } = await supabaseAdmin.from("repes_listing_images").select("id").eq("listing_id", existing.id);
      if (oldImages?.length) {
        await supabaseAdmin.from("repes_listing_images").delete().eq("listing_id", existing.id);
      }
      if (detail.imageUrls.length > 0) {
        const imageRows = detail.imageUrls.map((url, i) => ({ listing_id: existing.id, url, sort_order: i }));
        await supabaseAdmin.from("repes_listing_images").insert(imageRows);
      }
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("repes_listings")
        .insert({
          source_external_id: first.externalId,
          source_url: first.detailUrl,
          title: detail.title,
          price_text: priceTextToSave,
          location_raw: detail.locationRaw,
          description_html: detail.descriptionHtml,
          seller_name: detail.sellerName,
          seller_email: detail.sellerEmail,
          seller_phone: detail.sellerPhone,
          seller_address: detail.sellerAddress,
          pdf_url: detail.pdfUrl,
          pdf_urls: detail.pdfUrls?.length ? detail.pdfUrls : [],
          auction_date: auctionDate || null,
          auction_time: detail.auctionTime,
          meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : null,
          last_seen_at: nowIso,
          deleted_at: null,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({
          success: false,
          error: insertErr.message,
          extractedFromList,
          extractedFromDetail,
          listing: null,
        });
      }
      listingId = (inserted as { id: string }).id;
      if (detail.imageUrls.length > 0) {
        const imageRows = detail.imageUrls.map((url, i) => ({ listing_id: listingId, url, sort_order: i }));
        await supabaseAdmin.from("repes_listing_images").insert(imageRows);
      }
    }

    const { data: listing } = await supabaseAdmin
      .from("repes_listings")
      .select("id, source_external_id, source_url, title, price_text, location_raw, location_county, location_city, seller_name, auction_date, description_html")
      .eq("id", listingId)
      .single();

    return NextResponse.json({
      success: true,
      message: existing ? "Actualizat 1 anunț existent (test)." : "Inserat 1 anunț de test.",
      extractedFromList,
      extractedFromDetail,
      listing: listing || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      success: false,
      error: msg,
      extractedFromList: null,
      extractedFromDetail: null,
      listing: null,
    }, { status: 500 });
  }
}
