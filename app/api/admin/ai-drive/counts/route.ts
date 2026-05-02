/**
 * GET /api/admin/ai-drive/counts
 * Returns real counts of products and categories (service role, no RLS).
 * Used by admin AI Drive page so numbers match the actual DB and update correctly.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local." },
        { status: 503 }
      );
    }

    // Products: same as public listing – active/approved, NOT deleted, with title and description
    const { count: productsCount, error: productsErr } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .neq("status", "deleted")
      .or("status.eq.active,approval_status.eq.approved")
      .not("title", "is", null)
      .not("description", "is", null);

    if (productsErr) {
      console.error("[AI Drive Counts] Products error:", productsErr);
      return NextResponse.json(
        { success: false, error: productsErr.message },
        { status: 500 }
      );
    }

    // Categories: distinct category + subcategory from those same products (exclude deleted)
    const { data: catsData, error: catsErr } = await supabaseAdmin
      .from("products")
      .select("category, subcategory")
      .neq("status", "deleted")
      .or("status.eq.active,approval_status.eq.approved")
      .not("title", "is", null)
      .not("description", "is", null);

    if (catsErr) {
      console.error("[AI Drive Counts] Categories error:", catsErr);
      return NextResponse.json(
        { success: false, error: catsErr.message },
        { status: 500 }
      );
    }

    const categoriesSet = new Set<string>();
    (catsData || []).forEach((p: { category?: string; subcategory?: string }) => {
      if (p.category) categoriesSet.add(p.category);
      if (p.subcategory) categoriesSet.add(p.subcategory);
    });

    return NextResponse.json({
      success: true,
      products: productsCount ?? 0,
      categories: categoriesSet.size,
    });
  } catch (error: unknown) {
    console.error("[AI Drive Counts] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
