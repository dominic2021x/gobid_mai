/**
 * POST: approve a suggestion → apply classification and set status=approved.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { applyClassification } from "@/lib/categorization/apply";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 503 });
  }

  const id = (await params).id;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing suggestion id" }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("category_suggestions")
    .select("id, product_id, proposed_category, proposed_subcategory, proposed_level3, proposed_attributes, reason, source")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row || !(row as any).product_id) {
    return NextResponse.json({ success: false, error: "Suggestion not found or already processed" }, { status: 404 });
  }

  const r = row as any;
  const applyResult = await applyClassification({
    productId: r.product_id,
    categorySlug: r.proposed_category,
    subcategorySlug: r.proposed_subcategory,
    level3Slug: r.proposed_level3 ?? null,
    attributes: (r.proposed_attributes ?? {}) as Record<string, string>,
    reason: r.reason ?? "admin approved",
    source: "admin",
  });

  if (!applyResult.ok) {
    return NextResponse.json({ success: false, error: applyResult.error }, { status: 400 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("category_suggestions")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ success: true, applied: true, warning: "Apply ok but status update failed: " + updateErr.message });
  }
  return NextResponse.json({ success: true, applied: true });
}
