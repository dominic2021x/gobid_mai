import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    // Folosim un filtru stabil pentru a evita combinarea complexă de OR-uri pe count.
    const [liveBidRes, publicRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .neq("status", "deleted")
        .eq("product_type", "live-bid"),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .neq("status", "deleted")
        .or("product_type.eq.licitatii-publice,sale_type.eq.licitatii-insolventa,sale_type.eq.licitatie-publica"),
    ]);

    if (liveBidRes.error) {
      return NextResponse.json({ success: false, error: liveBidRes.error.message }, { status: 500 });
    }
    if (publicRes.error) {
      return NextResponse.json({ success: false, error: publicRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      totals: {
        liveBid: Number(liveBidRes.count || 0),
        licitatiiPublice: Number(publicRes.count || 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

