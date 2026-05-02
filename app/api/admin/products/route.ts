import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /api/admin/products
 * Listă produse admin (user_id is null), cu paginare. Fără limită de total.
 * Query: page, pageSize, search, status, category, subcategory, filterOptions.
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase admin not configured" },
        { status: 500 }
      );
    }
    const db = supabaseAdmin;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10))
    );
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || "all";
    const category = searchParams.get("category") || "all";
    const subcategory = searchParams.get("subcategory") || "all";
    const filterOptions = searchParams.get("filterOptions") === "1";

    function baseQuery() {
      let q = db
        .from("products")
        .select("id", { count: "exact", head: true })
        .is("user_id", null)
        .neq("status", "deleted");
      if (search) {
        q = q.or(
          `title.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`
        );
      }
      if (status !== "all") q = q.eq("status", status);
      if (category !== "all") q = q.eq("category", category);
      if (subcategory !== "all") q = q.eq("subcategory", subcategory);
      return q;
    }

    const { count: total, error: countError } = await baseQuery();
    if (countError) {
      console.error("admin products count error:", countError);
      return NextResponse.json(
        { error: countError.message || "Count failed" },
        { status: 500 }
      );
    }
    const totalCount = total ?? 0;

    let dataQuery = db
      .from("products")
      .select("*")
      .is("user_id", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    if (search) {
      dataQuery = dataQuery.or(
        `title.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`
      );
    }
    if (status !== "all") dataQuery = dataQuery.eq("status", status);
    if (category !== "all") dataQuery = dataQuery.eq("category", category);
    if (subcategory !== "all") dataQuery = dataQuery.eq("subcategory", subcategory);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: rows, error: dataError } = await dataQuery.range(from, to);

    if (dataError) {
      console.error("admin products data error:", dataError);
      return NextResponse.json(
        { error: dataError.message || "Data fetch failed" },
        { status: 500 }
      );
    }

    const anafProducts = (rows ?? []).filter((p: any) => p.product_type === "licitatii-publice");
    const anafProductIds = anafProducts.map((p: any) => p.id);
    let anafLicitatiiMap: Record<string, any> = {};
    if (anafProductIds.length > 0) {
      const { data: anafData } = await db
        .from("anaf_licitatii")
        .select("product_id, data_licitatie, created_at")
        .in("product_id", anafProductIds);
      if (anafData) {
        anafData.forEach((licitatie: any) => {
          if (licitatie.product_id) anafLicitatiiMap[licitatie.product_id] = licitatie;
        });
      }
    }

    const products = (rows ?? []).map((row: any) => {
      const customFields = row?.custom_fields && typeof row.custom_fields === "object" ? row.custom_fields : {};
      const seo =
        row?.seo && typeof row.seo === "object"
          ? {
              title: row.seo.title ?? "",
              description: row.seo.description ?? "",
              keywords: Array.isArray(row.seo.keywords) ? row.seo.keywords : [],
            }
          : { title: "", description: "", keywords: [] };
      let anafPublicationDate: string | undefined;
      if (row.product_type === "licitatii-publice") {
        const licitatie = anafLicitatiiMap[row.id];
        anafPublicationDate = licitatie?.data_licitatie || licitatie?.created_at;
      }
      if (!anafPublicationDate) {
        anafPublicationDate =
          customFields.data_publicare ||
          customFields.data_licitatie ||
          customFields["Data publicare"] ||
          customFields["Data licitație"];
      }
      if (!anafPublicationDate && row.product_type === "licitatii-publice") {
        anafPublicationDate = row.created_at;
      }
      const url = row.url ?? (row.slug ? `/${row.product_type === "licitatii-publice" ? "licitatii-publice" : "live_bid"}/${row.slug}` : undefined);
      return {
        id: row.id,
        title: row.title ?? "",
        description: row.description ?? "",
        category: row.category ?? "",
        subcategory: row.subcategory ?? "",
        sku: row.sku ?? "",
        startingPrice: typeof row.starting_price === "number" ? row.starting_price : row.starting_price_ron ?? 0,
        productType: (row.product_type ?? "live-bid") as string,
        currency: row.currency === "EUR" ? "EUR" : "RON",
        customFields,
        seo,
        status: row.status === "active" ? "active" : row.status === "deleted" ? "deleted" : "draft",
        images: Array.isArray(row.images) ? row.images : [],
        createdAt: row.created_at ?? new Date().toISOString(),
        anafPublicationDate,
        url: url ? url.replace(/^\/auctions\//, "/licitatii-publice/") : undefined,
        slug: row.slug ?? undefined,
        userId: row.user_id ?? undefined,
        approvalStatus: row.approval_status ?? "approved",
      };
    });

    const response: {
      products: typeof products;
      total: number;
      page: number;
      pageSize: number;
      categories?: string[];
      subcategories?: string[];
    } = {
      products,
      total: totalCount,
      page,
      pageSize,
    };

    if (filterOptions) {
      const { data: optRows } = await db
        .from("products")
        .select("category, subcategory")
        .is("user_id", null)
        .neq("status", "deleted")
        .limit(5000);
      const cats = new Set<string>();
      const subcats = new Set<string>();
      (optRows ?? []).forEach((r: any) => {
        if (r.category) cats.add(r.category);
        if (r.subcategory) subcats.add(r.subcategory);
      });
      response.categories = Array.from(cats).filter(Boolean).sort();
      response.subcategories = Array.from(subcats).filter(Boolean).sort();
    }

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("admin products API error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
