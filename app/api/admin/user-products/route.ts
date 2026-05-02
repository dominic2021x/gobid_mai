import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /api/admin/user-products
 * Paginare server-side: page, pageSize, search, status, category, subcategory, approval.
 * Returnează: products (o pagină), total, stats (counts per approval), categories, subcategories.
 * Fără limită de total produse – pot fi 100M+.
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
    const approval = searchParams.get("approval") || "all";
    const filterOptions = searchParams.get("filterOptions") === "1";

    function baseQuery() {
      let q = db
        .from("products")
        .select("id", { count: "exact", head: true })
        .not("user_id", "is", null)
        .neq("status", "deleted");
      if (search) {
        q = q.or(
          `title.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`
        );
      }
      if (status !== "all") q = q.eq("status", status);
      if (category !== "all") q = q.eq("category", category);
      if (subcategory !== "all") q = q.eq("subcategory", subcategory);
      if (approval !== "all") q = q.eq("approval_status", approval);
      return q;
    }

    // Count pentru filtrele curente (total pentru paginare)
    const { count: total, error: countError } = await baseQuery();
    if (countError) {
      console.error("user-products count error:", countError);
      return NextResponse.json(
        { error: countError.message || "Count failed" },
        { status: 500 }
      );
    }
    const totalCount = total ?? 0;

    // Stats: total per approval (fără filtre approval, dar cu restul filtrelor)
    let stats: { all: number; pending: number; approved: number; rejected: number } | undefined;
    try {
      const baseForStats = () => {
        let q = db
          .from("products")
          .select("id", { count: "exact", head: true })
          .not("user_id", "is", null)
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
      };
      const [
        { count: cAll },
        { count: cPending },
        { count: cApproved },
        { count: cRejected },
      ] = await Promise.all([
        baseForStats(),
        baseForStats().eq("approval_status", "pending"),
        baseForStats().eq("approval_status", "approved"),
        baseForStats().eq("approval_status", "rejected"),
      ]);
      stats = {
        all: cAll ?? 0,
        pending: cPending ?? 0,
        approved: cApproved ?? 0,
        rejected: cRejected ?? 0,
      };
    } catch (e) {
      console.warn("user-products stats error:", e);
    }

    // Pagină de produse (date complete)
    let dataQuery = db
      .from("products")
      .select("*")
      .not("user_id", "is", null)
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
    if (approval !== "all") dataQuery = dataQuery.eq("approval_status", approval);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: rows, error: dataError } = await dataQuery.range(from, to);

    if (dataError) {
      console.error("user-products data error:", dataError);
      return NextResponse.json(
        { error: dataError.message || "Data fetch failed" },
        { status: 500 }
      );
    }

    const productsWithUserId = (rows ?? []).filter((p: any) => p.user_id);
    const userIds = Array.from(new Set(productsWithUserId.map((p: any) => p.user_id)));
    let userProfilesMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await db
        .from("user_profiles")
        .select("user_id, first_name, last_name, email, phone, created_at, last_login")
        .in("user_id", userIds);
      if (profiles) {
        profiles.forEach((profile: any) => {
          userProfilesMap[profile.user_id] = profile;
        });
      }
    }

    const products = (rows ?? []).map((row: any) => {
      const userProfile = userProfilesMap[row.user_id];
      return {
        id: row.id,
        title: row.title || "Fără titlu",
        description: row.description || "",
        category: row.category || "Necategorizat",
        subcategory: row.subcategory || "",
        sku: row.sku || "",
        startingPrice: row.starting_price_ron ?? row.starting_price_eur ?? 0,
        productType: row.product_type || "live-bid",
        currency: row.currency || "RON",
        customFields: row.custom_fields || {},
        seo: {
          title: row.seo_title || row.title || "",
          description: row.seo_description || row.description || "",
          keywords: row.seo_keywords || [],
        },
        status: row.status || "draft",
        images: row.images || [],
        createdAt: row.created_at || new Date().toISOString(),
        url: row.url ?? undefined,
        slug: row.slug ?? undefined,
        userId: row.user_id ?? undefined,
        approvalStatus: row.approval_status ?? "pending",
        rejectionReason: row.rejection_reason ?? undefined,
        approvedAt: row.approved_at ?? undefined,
        approvedBy: row.approved_by ?? undefined,
        userEmail: userProfile?.email ?? undefined,
        userFirstName: userProfile?.first_name ?? undefined,
        userLastName: userProfile?.last_name ?? undefined,
        userPhone: userProfile?.phone ?? undefined,
        riskScore: row.risk_score ?? undefined,
        riskAnalysisData: row.risk_analysis_data ?? undefined,
      };
    });
    const response: {
      products: typeof products;
      total: number;
      page: number;
      pageSize: number;
      stats?: typeof stats;
      categories?: string[];
      subcategories?: string[];
    } = {
      products,
      total: totalCount,
      page,
      pageSize,
      stats,
    };

    if (filterOptions) {
      const { data: optRows } = await db
        .from("products")
        .select("category, subcategory")
        .not("user_id", "is", null)
        .neq("status", "deleted")
        .limit(3000);
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
    console.error("user-products API error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
