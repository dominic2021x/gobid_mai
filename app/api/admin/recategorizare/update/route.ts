/**
 * POST /api/admin/recategorizare/update
 * Single product update: category, subcategory, category_level_3, attributes.
 * Validates taxonomy; writes audit. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";
import { applyCategoryChange } from "@/lib/categorization/applyCategoryChange";
import { z } from "zod";
import { ATTRIBUTE_KEYS } from "@/lib/taxonomy/ro/attributes";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const updateBodySchema = z.object({
  productId: z.string().uuid(),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  level3: z.string().nullable().optional(),
  level4: z.string().nullable().optional(),
  listCategory: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  county: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 503 });
  }

  let body: z.infer<typeof updateBodySchema>;
  try {
    body = updateBodySchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((e) => e.message).join("; ") : "Invalid body";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }

  const verification = verifyTaxonomy({
    categorySlug: body.category,
    subcategorySlug: body.subcategory,
    level3Slug: body.level3 ?? undefined,
    level4Slug: body.level4 ?? undefined,
  });
  if (!verification.valid) {
    return NextResponse.json({ success: false, error: verification.error }, { status: 400 });
  }

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from("products")
    .select("id, category, subcategory, category_level_3, category_level_4, attributes")
    .eq("id", body.productId)
    .single();

  if (fetchErr || !before) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
  }

  const applyResult = await applyCategoryChange({
    productId: body.productId,
    categorySlug: body.category,
    subcategorySlug: body.subcategory,
    level3Slug: body.level3 ?? undefined,
    level4Slug: body.level4 ?? undefined,
    listCategory: body.listCategory ?? undefined,
  });

  if (!applyResult.ok) {
    return NextResponse.json({ success: false, error: applyResult.error }, { status: 400 });
  }

  const attrsToSet: Record<string, string> = {};
  if (body.attributes) {
    for (const key of ATTRIBUTE_KEYS) {
      const v = body.attributes[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") attrsToSet[key] = String(v).trim();
    }
  }
  const extraUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.keys(attrsToSet).length > 0) {
    extraUpdate.attributes = { ...((before as any).attributes ?? {}), ...attrsToSet };
  }
  if (body.county !== undefined) extraUpdate.county = body.county?.trim() || null;
  if (body.city !== undefined) extraUpdate.city = body.city?.trim() || null;
  if (Object.keys(extraUpdate).length > 1) {
    const { error: extraErr } = await supabaseAdmin
      .from("products")
      .update(extraUpdate)
      .eq("id", body.productId);
    if (extraErr) {
      return NextResponse.json({ success: false, error: "Category updated but extra fields failed: " + extraErr.message }, { status: 500 });
    }
  }

  const { data: after } = await supabaseAdmin
    .from("products")
    .select("id, category, subcategory, category_level_3, category_level_4, attributes")
    .eq("id", body.productId)
    .single();

  await supabaseAdmin.from("admin_recategorization_audit").insert({
    admin_user_id: auth.user.id,
    product_id: body.productId,
    action_type: "single",
    before_json: before,
    after_json: after ?? before,
    request_id: request.headers.get("x-request-id") ?? undefined,
  });

  return NextResponse.json({ success: true, productId: body.productId });
}
