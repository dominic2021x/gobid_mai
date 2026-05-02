/**
 * POST /api/admin/executari-publice/extract-pdf
 * Citește datele din PDF-ul anunțului REPES și actualizează listing-ul (descriere, titlu, locație, preț, meta_fields).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { extractTextFromPDFUrl } from "@/lib/anaf/pdfExtractor";
import { parseRepesPDFWithGPT } from "@/lib/repes/pdfParser";
import { inferRepesCategories } from "@/lib/repes/inferCategories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 120;

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

  const { data: listing, error: fetchError } = await supabaseAdmin
    .from("repes_listings")
    .select("id, pdf_url, pdf_urls, title, description_html, location_raw, location_city, location_county, price_text, auction_date, auction_time, meta_fields")
    .eq("id", listingId)
    .single();

  if (fetchError || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const pdfUrls = Array.isArray((listing as { pdf_urls?: string[] }).pdf_urls)
    ? (listing as { pdf_urls: string[] }).pdf_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const firstPdf = pdfUrls[0] ?? (listing as { pdf_url?: string }).pdf_url ?? null;
  if (!firstPdf || typeof firstPdf !== "string") {
    return NextResponse.json({ error: "Anunțul nu are PDF asociat" }, { status: 400 });
  }

  try {
    const extraction = await extractTextFromPDFUrl(firstPdf);
    const text = extraction?.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Nu s-a putut extrage text din PDF (gol sau OCR eșuat)" }, { status: 422 });
    }

    const parsed = await parseRepesPDFWithGPT(text);

    const existing = listing as {
      title: string | null;
      description_html: string | null;
      location_raw: string | null;
      location_city: string | null;
      location_county: string | null;
      price_text: string | null;
      auction_date: string | null;
      auction_time: string | null;
      meta_fields: Record<string, string> | null;
    };

    const update: Record<string, unknown> = {};
    if (parsed.description_html != null) update.description_html = parsed.description_html;
    if (parsed.title != null) update.title = parsed.title;
    if (parsed.location_raw != null) update.location_raw = parsed.location_raw;
    if (parsed.location_city != null) update.location_city = parsed.location_city;
    if (parsed.location_county != null) update.location_county = parsed.location_county;
    if (parsed.price_text != null) update.price_text = parsed.price_text;
    if (parsed.auction_date != null) update.auction_date = parsed.auction_date;
    if (parsed.auction_time != null) update.auction_time = parsed.auction_time;
    if (parsed.meta_fields != null && Object.keys(parsed.meta_fields).length > 0) {
      const merged = { ...(existing.meta_fields || {}), ...parsed.meta_fields };
      update.meta_fields = merged;
    }

    const titleForInfer = (update.title as string) ?? existing.title;
    const descForInfer = (update.description_html as string) ?? existing.description_html;
    const { main_category, category } = inferRepesCategories(titleForInfer, descForInfer);
    update.main_category = main_category;
    update.category = category;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true, message: "PDF citit, dar nu s-au găsit câmpuri de actualizat", listing });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("repes_listings")
      .update(update)
      .eq("id", listingId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, listing: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extract-pdf]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
