/**
 * POST – reîmprospătează câmpurile unui listing din pagina de detaliu.
 * Body: { only?: "description" | "auto" | "imobiliare" | "pdf" | "all" }
 * - description: doar description_html
 * - auto: info_marca, info_km, info_combustibil, info_an_fabricatie, info_capacitate_cilindrica
 * - imobiliare: info_suprafata, info_tip_imobil, info_camere, info_an_constructie
 * - pdf: pdf_url, pdf_urls
 * - all sau lipsă: toate câmpurile + imagini
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";
import { buildDetailUpdatePayload, DETAIL_UPDATE_GROUPS, type DetailUpdateGroup } from "@/lib/scraper/detailToPayload";
import { getMainCategoryFromSource } from "@/lib/data/licitatii-insolventa-category-map";

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

const VALID_GROUPS: DetailUpdateGroup[] = ["description", "auto", "imobiliare", "pdf", "seller", "all"];

function pickUpdateByGroup(update: Record<string, unknown>, only: DetailUpdateGroup): Record<string, unknown> {
  const keys = DETAIL_UPDATE_GROUPS[only];
  if (only === "all" || !keys || keys.length === 0) return update;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in update) out[k] = update[k] ?? null;
  }
  return out;
}

/** Supabase doesn't like undefined; use null and omit undefined keys. */
function sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const db = supabaseAdmin;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let only: DetailUpdateGroup = "all";
  try {
    const body = await request.json().catch(() => ({}));
    const raw = body?.only;
    if (raw != null && typeof raw === "string" && VALID_GROUPS.includes(raw as DetailUpdateGroup)) {
      only = raw as DetailUpdateGroup;
    }
  } catch {
    // keep all
  }

  const { data: listing, error: listError } = await db
    .from("licitatii_insolventa_listings")
    .select("id, source_url")
    .eq("id", id)
    .single();

  if (listError || !listing?.source_url) {
    return NextResponse.json({ error: "Listing not found or missing source_url" }, { status: 404 });
  }

  try {
    let html: string;
    try {
      html = await fetchHtml(listing.source_url as string);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return NextResponse.json({ error: `Fetch pagină eșuat: ${msg}` }, { status: 500 });
    }

    let detail: ReturnType<typeof parseDetailPage>;
    try {
      detail = parseDetailPage(html, listing.source_url as string);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return NextResponse.json({ error: `Parse pagină eșuat: ${msg}` }, { status: 500 });
    }

    let fullUpdate: Record<string, unknown>;
    let imageUrls: string[];
    try {
      const built = buildDetailUpdatePayload(detail);
      fullUpdate = built.update;
      imageUrls = built.imageUrls;
    } catch (buildErr) {
      const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
      return NextResponse.json({ error: `Build payload eșuat: ${msg}` }, { status: 500 });
    }

    const picked = pickUpdateByGroup(fullUpdate, only);
    if ((only === "all" || only === "description") && (picked.category != null || fullUpdate.category != null)) {
      const descHtml = (picked.description_html ?? fullUpdate.description_html) as string | undefined;
      (picked as Record<string, unknown>).main_category =
        getMainCategoryFromSource(
          (picked.category ?? fullUpdate.category) as string,
          (picked.title ?? fullUpdate.title) as string | undefined,
          descHtml ? descHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : undefined
        ) ?? null;
    }
    const updatePayload = sanitizePayload({
      ...picked,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);

    const { error: updateError } = await supabaseAdmin
      .from("licitatii_insolventa_listings")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: `Update DB: ${updateError.message}` }, { status: 500 });
    }

    if (only === "all") {
      const { data: existingImages } = await db
        .from("licitatii_insolventa_listing_images")
        .select("id")
        .eq("listing_id", id);

      if (existingImages?.length) {
        const { error: delErr } = await db
          .from("licitatii_insolventa_listing_images")
          .delete()
          .eq("listing_id", id);
        if (delErr) {
          return NextResponse.json({ error: `Ștergere imagini: ${delErr.message}` }, { status: 500 });
        }
      }
      if (imageUrls.length > 0) {
        const imageRows = imageUrls.map((url, i) => ({
          listing_id: id,
          url,
          sort_order: i,
        }));
        const { error: insertErr } = await db
          .from("licitatii_insolventa_listing_images")
          .insert(imageRows);
        if (insertErr) {
          return NextResponse.json({ error: `Inserare imagini: ${insertErr.message}` }, { status: 500 });
        }
      }
    }

    const label = only === "all" ? "Toate câmpurile" : only === "description" ? "Descriere" : only === "auto" ? "Auto" : only === "imobiliare" ? "Imobiliare" : "PDF-uri";
    return NextResponse.json({
      success: true,
      only,
      message: `Actualizat: ${label}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    return NextResponse.json(
      { error: message, ...(process.env.NODE_ENV === "development" && stack ? { detail: stack } : {}) },
      { status: 500 }
    );
  }
}
