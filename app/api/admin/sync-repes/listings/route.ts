/**
 * API - Listare produse sincronizate REPES (prod.executori.ro/repes)
 * GET ?statsOnly=1 | ?page=1&limit=20&status=active|deleted|all&county=...&idsOnly=1 etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { EXECUTARI_CAT_PRINCIPALA } from "@/lib/data/ro-categories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const table = "repes_listings";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const statsOnly = searchParams.get("statsOnly") === "1";
  const panel = searchParams.get("panel") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limitCap = panel ? 500 : 100;
  const limit = Math.min(limitCap, Math.max(1, parseInt(searchParams.get("limit") || (panel ? "100" : "50"), 10)));
  const status = searchParams.get("status") || "active";
  const county = searchParams.get("county")?.trim() || null;
  const idsOnly = searchParams.get("idsOnly") === "1";
  const publishedParam = searchParams.get("published")?.toLowerCase() || "";
  const search = (searchParams.get("search") || searchParams.get("q") || "").trim() || null;
  const timeFilter = searchParams.get("time") || "all";
  const orderParam = (searchParams.get("order") || "newest") as "newest" | "oldest" | "price_asc" | "price_desc";
  const mainCategory = searchParams.get("mainCategory")?.trim() || null;
  const categoryFilter = searchParams.get("category")?.trim() || null;

  const from = (page - 1) * limit;

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const startOfTodayIso = startOfToday.toISOString();

  const [totalRes, activeRes, deletedRes, withPdfRes, withDescRes, unpublishedRes, listedRes, countyRes, mainCategoryRes] = await Promise.all([
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).not("pdf_url", "is", null),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).not("description_html", "is", null),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).is("product_id", null),
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).not("product_id", "is", null),
    supabaseAdmin.from(table).select("location_county").is("deleted_at", null).not("location_county", "is", null),
    supabaseAdmin.from(table).select("main_category").is("deleted_at", null),
  ]);

  const stats = {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    deleted: deletedRes.count ?? 0,
    activeToday: 0,
    deletedToday: 0,
    reactivated: 0,
    withPdf: withPdfRes.count ?? 0,
    withDescription: withDescRes.count ?? 0,
    withoutDescription: (activeRes.count ?? 0) - (withDescRes.count ?? 0),
    unpublished: unpublishedRes.count ?? 0,
    listed: listedRes.count ?? 0,
    byCounty: [] as { county: string; count: number }[],
    byMainCategory: [] as { mainCategory: string; count: number }[],
  };

  const countyData = countyRes.data || [];
  const countyMap = new Map<string, number>();
  countyData.forEach((r: { location_county: string | null }) => {
    const c = r.location_county || "Necunoscut";
    countyMap.set(c, (countyMap.get(c) || 0) + 1);
  });
  stats.byCounty = Array.from(countyMap.entries())
    .map(([countyName, count]) => ({ county: countyName, count }))
    .sort((a, b) => b.count - a.count);

  // Aceeași logică ca la licitatii-publice: byMainCategory din valori fixe + „Fără categorie” pentru null
  const mainCategoryData = (mainCategoryRes.data || []) as { main_category: string | null }[];
  const mainCategoryMap = new Map<string, number>();
  mainCategoryData.forEach((r) => {
    const c = r.main_category?.trim() || "Fără categorie";
    mainCategoryMap.set(c, (mainCategoryMap.get(c) || 0) + 1);
  });
  stats.byMainCategory = EXECUTARI_CAT_PRINCIPALA.map((mc) => ({
    mainCategory: mc,
    count: mainCategoryMap.get(mc) ?? 0,
  }));
  const faraCount = mainCategoryMap.get("Fără categorie") ?? 0;
  if (faraCount > 0) {
    stats.byMainCategory.push({ mainCategory: "Fără categorie", count: faraCount });
  }
  // Afișăm doar categoriile cu count > 0 (ca la licitatii-publice)
  stats.byMainCategory = stats.byMainCategory.filter((x) => x.count > 0);

  if (statsOnly) {
    return NextResponse.json(
      { success: true, stats },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (idsOnly) {
    let idQuery = supabaseAdmin.from(table).select("id").order("last_seen_at", { ascending: false }).range(0, 9999);
    if (status === "active") idQuery = idQuery.is("deleted_at", null);
    else if (status === "deleted") idQuery = idQuery.not("deleted_at", "is", null);
    else if (status === "unpublished") idQuery = idQuery.is("deleted_at", null).is("product_id", null);
    else if (status === "listed") idQuery = idQuery.is("deleted_at", null).not("product_id", "is", null);
    if (county) idQuery = idQuery.eq("location_county", county);
    if (mainCategory) {
      if (mainCategory === "Fără categorie") {
        idQuery = idQuery.or("main_category.is.null,main_category.eq.");
      } else {
        idQuery = idQuery.eq("main_category", mainCategory);
      }
    }
    if (categoryFilter) idQuery = idQuery.eq("category", categoryFilter);
    if (publishedParam === "unpublished") idQuery = idQuery.is("deleted_at", null).is("product_id", null);
    else if (publishedParam === "published") idQuery = idQuery.is("deleted_at", null).not("product_id", "is", null);
    if (search) {
      const pattern = `%${search.replace(/%/g, "").trim()}%`;
      if (pattern.length > 1) idQuery = idQuery.or(`title.ilike.${pattern},seller_name.ilike.${pattern},source_external_id.ilike.${pattern}`);
    }
    if (timeFilter !== "all") {
      const since = timeFilter === "7d" ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : timeFilter === "30d" ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      idQuery = idQuery.gte("last_seen_at", since.toISOString());
    }
    const idResult = await idQuery;
    if (idResult.error) return NextResponse.json({ error: idResult.error.message }, { status: 500 });
    const ids = (idResult.data || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  const orderBy =
    orderParam === "oldest" ? { column: "last_seen_at" as const, ascending: true }
      : orderParam === "price_asc" ? { column: "price_text" as const, ascending: true }
        : orderParam === "price_desc" ? { column: "price_text" as const, ascending: false }
          : { column: "last_seen_at" as const, ascending: false };

  let query = supabaseAdmin
    .from(table)
    .select("id, source_external_id, source_url, title, price_text, location_city, location_county, location_raw, pdf_url, pdf_urls, last_seen_at, deleted_at, created_at, updated_at, seller_name, auction_date, description_html, product_id, reactivated_at, main_category, category", { count: "exact" })
    .order(orderBy.column, { ascending: orderBy.ascending })
    .range(from, from + limit - 1);

  if (status === "active") query = query.is("deleted_at", null);
  else if (status === "deleted") query = query.not("deleted_at", "is", null);
  else if (status === "unpublished") query = query.is("deleted_at", null).is("product_id", null);
  else if (status === "listed") query = query.is("deleted_at", null).not("product_id", "is", null);
  if (county) query = query.eq("location_county", county);
  if (mainCategory) {
    if (mainCategory === "Fără categorie") {
      query = query.or("main_category.is.null,main_category.eq.");
    } else {
      query = query.eq("main_category", mainCategory);
    }
  }
  if (categoryFilter) query = query.eq("category", categoryFilter);
  if (publishedParam === "unpublished" && status !== "listed") query = query.is("product_id", null);
  else if (publishedParam === "published" && status !== "unpublished") query = query.not("product_id", "is", null);
  if (search) {
    const pattern = `%${search.replace(/%/g, "").trim()}%`;
    if (pattern.length > 1) query = query.or(`title.ilike.${pattern},seller_name.ilike.${pattern},source_external_id.ilike.${pattern}`);
  }
  if (timeFilter !== "all") {
    const since = timeFilter === "7d" ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : timeFilter === "30d" ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    query = query.gte("last_seen_at", since.toISOString());
  }

  const result = await query;
  const listings = result.data || [];
  const listingIds = (listings as { id: string }[]).map((l) => l.id);

  let imageCounts: Record<string, number> = {};
  if (listingIds.length > 0) {
    const { data: imgRows } = await supabaseAdmin.from("repes_listing_images").select("listing_id").in("listing_id", listingIds);
    (imgRows || []).forEach((r: { listing_id: string }) => {
      imageCounts[r.listing_id] = (imageCounts[r.listing_id] || 0) + 1;
    });
  }

  const productIds = (listings as { product_id?: string }[]).map((l) => l.product_id).filter(Boolean) as string[];
  let productSlugs: Record<string, string> = {};
  let productCodAnunt: Record<string, string> = {};
  if (productIds.length > 0) {
    const { data: products } = await supabaseAdmin.from("products").select("id, slug, custom_fields").in("id", productIds);
    (products || []).forEach((p: { id: string; slug: string | null; custom_fields?: { cod_anunt?: string } | null }) => {
      if (p.slug) productSlugs[p.id] = p.slug;
      const cod = p.custom_fields?.cod_anunt ?? (p.custom_fields as Record<string, string> | undefined)?.["Cod anunț"];
      if (cod && String(cod).trim()) productCodAnunt[p.id] = String(cod).trim();
    });
  }

  const rows = (listings as Record<string, unknown>[]).map((l) => ({
    ...l,
    images_count: imageCounts[l.id as string] ?? 0,
    product_slug: (l.product_id && productSlugs[l.product_id as string]) || null,
    product_cod_anunt: (l.product_id && productCodAnunt[l.product_id as string]) || null,
  }));

  return NextResponse.json({
    success: true,
    stats,
    listings: rows,
    totalCount: result.count ?? 0,
    page,
    limit,
  });
}
