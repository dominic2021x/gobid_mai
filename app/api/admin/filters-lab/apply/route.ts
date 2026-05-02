import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { applyCategoryChange, type ApplyCategoryChangeInput } from "@/lib/categorization/applyCategoryChange";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


type ApplyChange = {
  productId: string;
  categorySlug: string;
  subcategorySlug: string;
  listCategory?: string;
};

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      changes?: ApplyChange[];
      dryRun?: boolean;
    };

    const dryRun = Boolean(body.dryRun ?? false);
    const changes = Array.isArray(body.changes) ? body.changes : [];

    if (changes.length === 0) {
      return NextResponse.json({ success: false, error: "Nu există schimbări de aplicat." }, { status: 400 });
    }

    const normalized = changes
      .map((c) => ({
        productId: String(c.productId || "").trim(),
        categorySlug: String(c.categorySlug || "").trim(),
        subcategorySlug: String(c.subcategorySlug || "").trim(),
        listCategory: String(c.listCategory || "").trim(),
      }))
      .filter((c) => c.productId && c.categorySlug && c.subcategorySlug)
      .filter((c) => RO_CATEGORIES[c.categorySlug]?.subcategories?.includes(c.subcategorySlug));

    if (normalized.length === 0) {
      return NextResponse.json({ success: false, error: "Schimbările sunt invalide (slug-uri necunoscute)." }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        accepted: normalized.length,
        skipped: changes.length - normalized.length,
      });
    }

    let updated = 0;
    const errors: Array<{ productId: string; error: string }> = [];
    const updatedRows: Array<{ productId: string; category: string; subcategory: string }> = [];

    for (const c of normalized) {
      const input: ApplyCategoryChangeInput = {
        productId: c.productId,
        categorySlug: c.categorySlug,
        subcategorySlug: c.subcategorySlug,
        listCategory: c.listCategory || undefined,
      };
      const result = await applyCategoryChange(input);
      if (result.ok) {
        updated += 1;
        updatedRows.push({
          productId: c.productId,
          category: c.categorySlug,
          subcategory: c.subcategorySlug,
        });
      } else {
        errors.push({ productId: c.productId, error: result.error ?? "Unknown error" });
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      failed: errors.length,
      errors: errors.slice(0, 30),
      updatedRows: updatedRows.slice(0, 200),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}
