/**
 * API - Listare produse sincronizate licitatii-insolventa.ro
 * GET ?statsOnly=1 | ?page=1&limit=20&status=active|deleted|all&county=...&category=...&time=7d|30d|90d|all&withPdf=1&withDescription=1&withoutDescription=1&withoutAuctionDate=1
 * GET ?idsOnly=1&unpublishedOnly=1 – returnează { ids: string[] } pentru anunțuri nepublicate (fără product_id). ?idsOnly=1&withoutDescription=1 etc. – idem pentru alte filtre.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getMainCategoryFromSource, MAIN_CATEGORIES_INSOLVENTA } from "@/lib/data/licitatii-insolventa-category-map";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin!.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
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
  const db = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const statsOnly = searchParams.get("statsOnly") === "1";
  const panel = searchParams.get("panel") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limitCap = panel ? 5000 : 50;
  const limit = Math.min(limitCap, Math.max(1, parseInt(searchParams.get("limit") || (panel ? "2000" : "20"), 10)));
  const status = searchParams.get("status") || "active";
  const county = searchParams.get("county")?.trim() || null;
  const filterPdf = searchParams.get("withPdf") === "1";
  const filterDescription = searchParams.get("withDescription") === "1";
  const filterWithoutDescription = searchParams.get("withoutDescription") === "1";
  const filterWithoutAuctionDate = searchParams.get("withoutAuctionDate") === "1";
  const filterWithoutTitle = searchParams.get("withoutTitle") === "1";
  const filterWithoutCounty = searchParams.get("withoutCounty") === "1";
  const filterWithoutSellerDetails = searchParams.get("withoutSellerDetails") === "1";
  const categoryFilter = searchParams.get("category")?.trim() || null;
  const timeFilter = searchParams.get("time") || "all"; // 7d | 30d | 90d | all
  const orderParam = (searchParams.get("order") || "newest") as "newest" | "oldest" | "price_asc" | "price_desc";
  const idsOnly = searchParams.get("idsOnly") === "1";
  const unpublishedOnly = searchParams.get("unpublishedOnly") === "1";
  const onSite = searchParams.get("onSite") === "1";
  const publishedParam = searchParams.get("published")?.toLowerCase() || ""; // all | published | unpublished
  const search = (searchParams.get("search") || searchParams.get("q") || "").trim() || null;
  const mainCategory = searchParams.get("mainCategory")?.trim() || null;

  const from = (page - 1) * limit;

  const table = "licitatii_insolventa_listings";

  const stats: {
    total: number;
    active: number;
    deleted: number;
    activeToday: number;
    deletedToday: number;
    reactivated: number;
    reactivatedToday: number;
    withPdf: number;
    withDescription: number;
    withoutDescription: number;
    withoutAuctionDate: number;
    withoutTitle: number;
    withoutCounty: number;
    withoutSellerDetails: number;
    unpublished: number;
    byCounty: { county: string; count: number }[];
    byCategory: { category: string; count: number }[];
    byMainCategory: { mainCategory: string; count: number }[];
  } = {
    total: 0,
    active: 0,
    deleted: 0,
    activeToday: 0,
    deletedToday: 0,
    reactivated: 0,
    reactivatedToday: 0,
    withPdf: 0,
    withDescription: 0,
    withoutDescription: 0,
    withoutAuctionDate: 0,
    withoutTitle: 0,
    withoutCounty: 0,
    withoutSellerDetails: 0,
    unpublished: 0,
    byCounty: [],
    byCategory: [],
    byMainCategory: [],
  };

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const startOfTodayIso = startOfToday.toISOString();

  const countResults = await Promise.all([
    db.from(table).select("id", { count: "exact", head: true }),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from(table).select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).not("pdf_url", "is", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).not("description_html", "is", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).is("description_html", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).is("auction_date", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).or("title.is.null,title.eq."),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).or("location_county.is.null,location_county.eq."),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).or("seller_name.is.null,seller_name.eq.,seller_email.is.null,seller_email.eq.,seller_phone.is.null,seller_phone.eq.,seller_address.is.null,seller_address.eq."),
    db.from(table).select("location_county").is("deleted_at", null).not("location_county", "is", null),
    db.from(table).select("category").is("deleted_at", null).not("category", "is", null),
    db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).is("product_id", null),
  ]);

  stats.total = countResults[0].count ?? 0;
  stats.active = countResults[1].count ?? 0;
  stats.deleted = countResults[2].count ?? 0;
  stats.withPdf = countResults[3].count ?? 0;
  stats.withDescription = countResults[4].count ?? 0;
  stats.withoutDescription = countResults[5].count ?? 0;
  stats.withoutAuctionDate = countResults[6].count ?? 0;
  stats.withoutTitle = countResults[7].count ?? 0;
  stats.withoutCounty = countResults[8].count ?? 0;
  stats.withoutSellerDetails = countResults[9].count ?? 0;
  stats.unpublished = countResults[12].count ?? 0;
  const categoryData = countResults[11].data;

  const { count: activeTodayCount } = await db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", startOfTodayIso);
  stats.activeToday = activeTodayCount ?? 0;

  const { count: deletedTodayCount } = await db.from(table).select("id", { count: "exact", head: true }).not("deleted_at", "is", null).gte("deleted_at", startOfTodayIso);
  stats.deletedToday = deletedTodayCount ?? 0;

  try {
    const { count: reactivatedCount, error: reactErr } = await db.from(table).select("id", { count: "exact", head: true }).not("reactivated_at", "is", null);
    if (!reactErr) {
      stats.reactivated = reactivatedCount ?? 0;
      const { count: reactivatedTodayCount } = await db.from(table).select("id", { count: "exact", head: true }).not("reactivated_at", "is", null).gte("reactivated_at", startOfTodayIso);
      stats.reactivatedToday = reactivatedTodayCount ?? 0;
    }
  } catch {
    stats.reactivated = 0;
    stats.reactivatedToday = 0;
  }

  const { data: countyRpcData } = await db.rpc("get_licitatii_count_by_county");
  if (Array.isArray(countyRpcData) && countyRpcData.length >= 0) {
    stats.byCounty = countyRpcData.map((r: { county: string | null; count: number }) => ({
      county: r.county || "Necunoscut",
      count: Number(r.count) || 0,
    }));
  } else {
    const countyData = countResults[10].data;
    const countyMap = new Map<string, number>();
    (countyData || []).forEach((r: { location_county: string | null }) => {
      const c = r.location_county || "Necunoscut";
      countyMap.set(c, (countyMap.get(c) || 0) + 1);
    });
    stats.byCounty = Array.from(countyMap.entries())
      .map(([county, count]) => ({ county, count }))
      .sort((a, b) => b.count - a.count);
  }

  const categoryMap = new Map<string, number>();
  (categoryData || []).forEach((r: { category: string | null }) => {
    const c = (r.category || "").trim() || "Fără categorie";
    categoryMap.set(c, (categoryMap.get(c) || 0) + 1);
  });
  stats.byCategory = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  try {
    const mainCategoryCounts = await Promise.all(
      MAIN_CATEGORIES_INSOLVENTA.map((mc) =>
        db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null).eq("main_category", mc)
      )
    );
    stats.byMainCategory = MAIN_CATEGORIES_INSOLVENTA.map((mc, i) => ({
      mainCategory: mc,
      count: mainCategoryCounts[i]?.count ?? 0,
    })).filter((x) => x.count > 0);
  } catch {
    stats.byMainCategory = [];
  }

  if (statsOnly) {
    return NextResponse.json(
      { success: true, stats },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  if (idsOnly && filterWithoutDescription) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .is("description_html", null)
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  if (idsOnly && filterWithoutAuctionDate) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .is("auction_date", null)
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  if (idsOnly && filterWithoutTitle) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .or("title.is.null,title.eq.")
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  if (idsOnly && filterWithoutCounty) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .or("location_county.is.null,location_county.eq.")
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  if (idsOnly && filterWithoutSellerDetails) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .or("seller_name.is.null,seller_name.eq.,seller_email.is.null,seller_email.eq.,seller_phone.is.null,seller_phone.eq.,seller_address.is.null,seller_address.eq.")
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  if (idsOnly && unpublishedOnly) {
    const { data: rows, error: idError } = await db
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .is("product_id", null)
      .limit(5000);
    if (idError) return NextResponse.json({ error: idError.message }, { status: 500 });
    const ids = (rows || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  /** idsOnly=1 cu aceleași filtre ca listarea: returnează toate ID-urile (max 10000) care respectă filtrele curente */
  if (idsOnly) {
    let idQuery = db.from(table).select("id").order("last_seen_at", { ascending: false }).range(0, 9999);
    if (status === "active") idQuery = idQuery.is("deleted_at", null);
    else if (status === "deleted") idQuery = idQuery.not("deleted_at", "is", null);
    else if (status === "reactivated") idQuery = idQuery.is("deleted_at", null).not("reactivated_at", "is", null);
    if (county) idQuery = idQuery.eq("location_county", county);
    if (categoryFilter) idQuery = idQuery.eq("category", categoryFilter);
    if (mainCategory) idQuery = idQuery.eq("main_category", mainCategory);
    if (timeFilter !== "all") {
      const now = new Date();
      let since: Date;
      if (timeFilter === "7d") since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (timeFilter === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (timeFilter === "90d") since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      else since = now;
      idQuery = idQuery.gte("last_seen_at", since.toISOString());
    }
    if (filterPdf) idQuery = idQuery.not("pdf_url", "is", null);
    if (filterDescription) idQuery = idQuery.not("description_html", "is", null);
    if (filterWithoutDescription) idQuery = idQuery.is("description_html", null);
    if (filterWithoutAuctionDate) idQuery = idQuery.is("auction_date", null);
    if (filterWithoutTitle) idQuery = idQuery.or("title.is.null,title.eq.");
    if (filterWithoutCounty) idQuery = idQuery.or("location_county.is.null,location_county.eq.");
    if (filterWithoutSellerDetails) idQuery = idQuery.or("seller_name.is.null,seller_name.eq.,seller_email.is.null,seller_email.eq.,seller_phone.is.null,seller_phone.eq.,seller_address.is.null,seller_address.eq.");
    if (publishedParam === "unpublished") idQuery = idQuery.is("deleted_at", null).is("product_id", null);
    else if (publishedParam === "published" || onSite) idQuery = idQuery.is("deleted_at", null).not("product_id", "is", null);
    if (search) {
      const safe = search.replace(/,/g, " ").replace(/%/g, "").replace(/_/g, " ").trim();
      if (safe) {
        const pattern = `%${safe}%`;
        idQuery = idQuery.or(`title.ilike.${pattern},seller_name.ilike.${pattern},source_external_id.ilike.${pattern}`);
      }
    }
    const idResult = await idQuery;
    if (idResult.error) return NextResponse.json({ error: idResult.error.message }, { status: 500 });
    const ids = (idResult.data || []).map((r: { id: string }) => r.id);
    return NextResponse.json({ success: true, ids });
  }

  const orderBy =
    orderParam === "oldest"
      ? { column: "last_seen_at" as const, ascending: true }
      : orderParam === "price_asc"
        ? { column: "price_text" as const, ascending: true }
        : orderParam === "price_desc"
          ? { column: "price_text" as const, ascending: false }
          : { column: "last_seen_at" as const, ascending: false };

  const selectColumnsBaseWithMain =
    "id, source_external_id, source_url, title, price_text, category, main_category, location_city, location_county, location_raw, pdf_url, pdf_urls, last_seen_at, deleted_at, created_at, updated_at, seller_name, auction_date, sale_type, description_html";
  const selectColumnsBaseNoMain =
    "id, source_external_id, source_url, title, price_text, category, location_city, location_county, location_raw, pdf_url, pdf_urls, last_seen_at, deleted_at, created_at, updated_at, seller_name, auction_date, sale_type, description_html";
  const selectColumns = selectColumnsBaseWithMain + ", reactivated_at";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db.from(table).select(
    `${selectColumns}, product_id`,
    { count: "exact" }
  ).order(orderBy.column, { ascending: orderBy.ascending }).range(from, from + limit - 1);
  const selectColumnsBase = selectColumnsBaseWithMain;

  if (status === "active") query = query.is("deleted_at", null);
  else if (status === "deleted") query = query.not("deleted_at", "is", null);
  else if (status === "reactivated") query = query.is("deleted_at", null).not("reactivated_at", "is", null);
  if (county) query = query.eq("location_county", county);
  if (categoryFilter) query = query.eq("category", categoryFilter);
  if (mainCategory) query = query.eq("main_category", mainCategory);
  if (timeFilter !== "all") {
    const now = new Date();
    let since: Date;
    if (timeFilter === "7d") since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeFilter === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (timeFilter === "90d") since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    else since = now;
    query = query.gte("last_seen_at", since.toISOString());
  }
  if (filterPdf) query = query.not("pdf_url", "is", null);
  if (filterDescription) query = query.not("description_html", "is", null);
  if (filterWithoutDescription) query = query.is("description_html", null);
  if (filterWithoutAuctionDate) query = query.is("auction_date", null);
  if (filterWithoutTitle) query = query.or("title.is.null,title.eq.");
  if (filterWithoutCounty) query = query.or("location_county.is.null,location_county.eq.");
  if (filterWithoutSellerDetails) query = query.or("seller_name.is.null,seller_name.eq.,seller_email.is.null,seller_email.eq.,seller_phone.is.null,seller_phone.eq.,seller_address.is.null,seller_address.eq.");
  if (publishedParam === "unpublished") query = query.is("product_id", null);
  else if (publishedParam === "published" || onSite) query = query.not("product_id", "is", null);
  if (search) {
    const safe = search.replace(/,/g, " ").replace(/%/g, "").replace(/_/g, " ").trim();
    if (safe) {
      const pattern = `%${safe}%`;
      query = query.or(`title.ilike.${pattern},seller_name.ilike.${pattern},source_external_id.ilike.${pattern}`);
    }
  }

  let result = await query;
  let listings = result.data;
  let count = result.count;
  if (result.error) {
    const msg = (result.error as { message?: string }).message || "";
    if (msg.includes("reactivated_at") && status === "reactivated") {
      return NextResponse.json({ success: true, listings: [], totalCount: 0 });
    }
    const useFallbackColumns = msg.includes("main_category") || msg.includes("product_id") || msg.includes("reactivated_at") || msg.includes("does not exist");
    if (useFallbackColumns) {
      const columnsToUse = msg.includes("reactivated_at")
        ? selectColumnsBaseNoMain + ", product_id"
        : msg.includes("main_category") || msg.includes("does not exist")
          ? selectColumnsBaseNoMain + ", reactivated_at, product_id"
          : selectColumnsBaseWithMain;
      query = db.from(table).select(columnsToUse, { count: "exact" })
        .order(orderBy.column, { ascending: orderBy.ascending }).range(from, from + limit - 1);
      if (status === "active") query = query.is("deleted_at", null);
      else if (status === "deleted") query = query.not("deleted_at", "is", null);
      else if (status === "reactivated") query = query.is("deleted_at", null).not("reactivated_at", "is", null);
      if (county) query = query.eq("location_county", county);
      if (categoryFilter) query = query.eq("category", categoryFilter);
      if (mainCategory && !msg.includes("main_category") && !msg.includes("does not exist")) query = query.eq("main_category", mainCategory);
      if (timeFilter !== "all") {
        const now = new Date();
        let since: Date;
        if (timeFilter === "7d") since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else if (timeFilter === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        else if (timeFilter === "90d") since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        else since = now;
        query = query.gte("last_seen_at", since.toISOString());
      }
      if (filterPdf) query = query.not("pdf_url", "is", null);
      if (filterDescription) query = query.not("description_html", "is", null);
      if (filterWithoutDescription) query = query.is("description_html", null);
      if (filterWithoutAuctionDate) query = query.is("auction_date", null);
      if (filterWithoutTitle) query = query.or("title.is.null,title.eq.");
      if (filterWithoutCounty) query = query.or("location_county.is.null,location_county.eq.");
      if (filterWithoutSellerDetails) query = query.or("seller_name.is.null,seller_name.eq.,seller_email.is.null,seller_email.eq.,seller_phone.is.null,seller_phone.eq.,seller_address.is.null,seller_address.eq.");
      if (publishedParam === "unpublished") {
        query = query.is("deleted_at", null).is("product_id", null);
      } else if (publishedParam === "published" || onSite) {
        query = query.is("deleted_at", null).not("product_id", "is", null);
      }
      if (search) {
        const safe = search.replace(/,/g, " ").replace(/%/g, "").replace(/_/g, " ").trim();
        if (safe) {
          const pattern = `%${safe}%`;
          query = query.or(`title.ilike.${pattern},seller_name.ilike.${pattern},source_external_id.ilike.${pattern}`);
        }
      }
      const retry = await query;
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      listings = retry.data;
      count = retry.count;
    } else {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  const listingIds = (listings || []).map((l: { id: string }) => l.id);
  let imageCounts: Record<string, number> = {};
  if (listingIds.length > 0) {
    const { data: imgRows } = await db
      .from("licitatii_insolventa_listing_images")
      .select("listing_id")
      .in("listing_id", listingIds);
    (imgRows || []).forEach((r: { listing_id: string }) => {
      imageCounts[r.listing_id] = (imageCounts[r.listing_id] || 0) + 1;
    });
  }

  const productIds = (listings || [])
    .map((l: Record<string, unknown>) => l.product_id as string)
    .filter(Boolean);
  let productSlugs: Record<string, string> = {};
  let productDetails: Record<string, { title?: string; description?: string; category?: string; subcategory?: string; county?: string; city?: string; starting_price?: number; starting_price_ron?: number }> = {};
  if (productIds.length > 0) {
    const { data: products } = await db
      .from("products")
      .select("id, slug, title, description, category, subcategory, county, city, starting_price, starting_price_ron")
      .in("id", productIds);
    (products || []).forEach((p: {
      id: string;
      slug: string | null;
      title?: string | null;
      description?: string | null;
      category?: string | null;
      subcategory?: string | null;
      county?: string | null;
      city?: string | null;
      starting_price?: number | null;
      starting_price_ron?: number | null;
    }) => {
      if (p.slug) productSlugs[p.id] = p.slug;
      productDetails[p.id] = {
        title: p.title ?? undefined,
        description: (p.description ?? "").slice(0, 500),
        category: p.category ?? undefined,
        subcategory: p.subcategory ?? undefined,
        county: p.county ?? undefined,
        city: p.city ?? undefined,
        starting_price: p.starting_price ?? p.starting_price_ron ?? undefined,
      };
    });
  }

  const stripHtml = (html: string | null | undefined) =>
    html ? String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  const rows = (listings || []).map((l: Record<string, unknown>) => {
    const pid = l.product_id as string | undefined;
    const details = pid ? productDetails[pid] : null;
    const categoryRaw = (l.category as string) ?? "";
    const categoryNorm = categoryRaw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const descriptionText =
      stripHtml(l.description_html as string) || details?.description || undefined;
    const storedMain = (l.main_category as string)?.trim();
    const computedMain = getMainCategoryFromSource(
      categoryRaw || null,
      (l.title as string) ?? undefined,
      descriptionText
    );
    // Oferte grupate are prioritate dacă a fost calculat; apoi utilaje = strict Utilaje & Echipamente
    if (computedMain === "Oferte grupate") {
      return {
        ...l,
        main_category: "Oferte grupate",
        images_count: imageCounts[l.id as string] ?? 0,
        product_slug: (pid && productSlugs[pid]) || null,
        product_title: details?.title ?? null,
        product_description: details?.description ?? null,
        product_category: details?.category ?? null,
        product_subcategory: details?.subcategory ?? null,
        product_county: details?.county ?? null,
        product_city: details?.city ?? null,
        product_price: details?.starting_price ?? null,
      };
    }
    // Toate anunțurile cu subcategoria „Masini si utilaje” / orice categorie cu „utilaje” = strict Utilaje & Echipamente
    if (categoryNorm && /utilaje/.test(categoryNorm)) {
      return {
        ...l,
        main_category: "Utilaje & Echipamente",
        images_count: imageCounts[l.id as string] ?? 0,
        product_slug: (pid && productSlugs[pid]) || null,
        product_title: details?.title ?? null,
        product_description: details?.description ?? null,
        product_category: details?.category ?? null,
        product_subcategory: details?.subcategory ?? null,
        product_county: details?.county ?? null,
        product_city: details?.city ?? null,
        product_price: details?.starting_price ?? null,
      };
    }
    // Când în DB e deja Diverse, recalculăm din titlu/descriere ca să putem upgrade la Imobiliare etc.
    const mainCat =
      storedMain && storedMain !== "Diverse / Speciale" ? storedMain : computedMain;
    return {
      ...l,
      main_category: mainCat || null,
      images_count: imageCounts[l.id as string] ?? 0,
      product_slug: (pid && productSlugs[pid]) || null,
      product_title: details?.title ?? null,
      product_description: details?.description ?? null,
      product_category: details?.category ?? null,
      product_subcategory: details?.subcategory ?? null,
      product_county: details?.county ?? null,
      product_city: details?.city ?? null,
      product_price: details?.starting_price ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    stats,
    listings: rows,
    totalCount: count ?? 0,
    page,
    limit,
  });
}
