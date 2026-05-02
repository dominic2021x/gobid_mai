/**
 * Cron: enterprise auto-categorize. Dictionary-driven engine; apply when confidence >= 0.9; else save suggestion.
 * Respects category_overrides (locked), 24h cooldown, non-empty title.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { classify } from "@/lib/categorization/engine";
import { applyClassification } from "@/lib/categorization/apply";
import { DEFAULT_STATUS } from "@/lib/server/products/listingsWhere";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 20;

const BATCH_SIZE = 200;
const LISTING_STATUSES = [...DEFAULT_STATUS];
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function authCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === secret;
}

export async function GET(request: NextRequest) {
  if (!authCron(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin not configured" }, { status: 503 });
  }

  let lockedIds: string[] = [];
  try {
    const { data: overrides } = await supabaseAdmin
      .from("category_overrides")
      .select("product_id")
      .eq("locked", true);
    lockedIds = (overrides ?? []).map((r: { product_id: string }) => r.product_id);
  } catch {
    // Table may not exist
  }

  let builder = supabaseAdmin
    .from("products")
    .select("id, title, description, category, subcategory, category_level_3, custom_fields")
    .in("status", LISTING_STATUSES)
    .or("category.is.null,category.eq.diverse,subcategory.is.null,subcategory.eq.")
    .not("title", "is", null)
    .limit(BATCH_SIZE);

  if (lockedIds.length > 0) {
    builder = builder.not("id", "in", `(${lockedIds.join(",")})`);
  }

  const { data: rows, error: fetchError } = await builder;

  if (fetchError) {
    return NextResponse.json(
      { success: false, scanned: 0, applied: 0, suggested: 0, skipped: 0, errors: [fetchError.message] },
      { status: 500 }
    );
  }

  const now = Date.now();
  const products = (rows ?? []).filter((p: any) => {
    const t = String(p?.title ?? "").trim();
    if (!t) return false;
    const cf = p?.custom_fields && typeof p.custom_fields === "object" ? p.custom_fields : {};
    const lastAt = cf?.last_auto_categorized_at;
    if (lastAt) {
      const ts = new Date(lastAt).getTime();
      if (Number.isFinite(ts) && now - ts < COOLDOWN_MS) return false;
    }
    return true;
  });

  let applied = 0;
  let suggested = 0;
  let skipped = (rows ?? []).length - products.length;
  const errors: string[] = [];

  for (const p of products) {
    const id = (p as any).id;
    const input = {
      id,
      title: String((p as any).title ?? "").trim(),
      description: (p as any).description != null ? String((p as any).description) : undefined,
      currentCategory: String((p as any).category ?? ""),
      currentSubcategory: String((p as any).subcategory ?? ""),
      currentLevel3: (p as any).category_level_3 ?? undefined,
      custom_fields: (p as any).custom_fields,
    };

    const result = classify(input);
    if (!result) {
      skipped += 1;
      continue;
    }

    if (result.confidence >= 0.9) {
      const applyResult = await applyClassification({
        productId: id,
        categorySlug: result.categorySlug,
        subcategorySlug: result.subcategorySlug,
        level3Slug: result.level3Slug ?? null,
        attributes: Object.keys(result.attributes ?? {}).length > 0 ? result.attributes : undefined,
        brand: result.brand ?? null,
        model: result.model ?? null,
        reason: result.reason,
        source: result.source,
      });
      if (applyResult.ok) applied += 1;
      else errors.push(`${id}: ${applyResult.error ?? "apply failed"}`);
    } else {
      try {
        await supabaseAdmin.from("category_suggestions").insert({
          product_id: id,
          proposed_category: result.categorySlug,
          proposed_subcategory: result.subcategorySlug,
          proposed_level3: result.level3Slug ?? null,
          proposed_attributes: (result.attributes ?? {}) as Record<string, unknown>,
          confidence: result.confidence,
          reason: result.reason,
          source: result.source,
          status: "pending",
        });
        suggested += 1;
      } catch (e: any) {
        if (e?.code !== "42P01") errors.push(`${id}: suggestion insert ${e?.message ?? e}`);
      }
    }
  }

  return NextResponse.json(
    {
      success: true,
      scanned: products.length,
      applied,
      suggested,
      skipped,
      errors: errors.slice(0, 50),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
