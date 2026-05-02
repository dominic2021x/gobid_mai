/**
 * GET: list category_suggestions (pending by default). Admin only.
 */

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
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 503 });
  }

  const status = request.nextUrl.searchParams.get("status")?.trim() || "pending";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);

  const { data, error } = await supabaseAdmin
    .from("category_suggestions")
    .select("id, product_id, proposed_category, proposed_subcategory, proposed_level3, proposed_attributes, confidence, reason, source, status, created_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, items: data ?? [] });
}
