/**
 * Enterprise apply: category + subcategory + level3 + attributes. Full audit. Skips when override locked.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";
import { applyCategoryChange, type ApplyCategoryChangeInput } from "@/lib/categorization/applyCategoryChange";
import type { ProductAttributes } from "@/lib/taxonomy/ro/attributes";
import type { ClassificationSource } from "@/lib/categorization/engine";

export type ApplyClassificationInput = {
  productId: string;
  categorySlug: string;
  subcategorySlug: string;
  level3Slug?: string | null;
  attributes?: ProductAttributes;
  brand?: string | null;
  model?: string | null;
  reason: string;
  source: ClassificationSource;
  listCategory?: string;
};

export type ApplyClassificationResult = { ok: boolean; error?: string };

const AUDIT_VERSION = 1;

/**
 * Apply classification: validate taxonomy, check override lock, write category/subcategory/level3 + attributes, audit.
 */
export async function applyClassification(input: ApplyClassificationInput): Promise<ApplyClassificationResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin not configured." };

  const productId = String(input.productId ?? "").trim();
  if (!productId || !input.categorySlug || !input.subcategorySlug) {
    return { ok: false, error: "Missing productId, categorySlug or subcategorySlug." };
  }

  const verification = verifyTaxonomy({
    categorySlug: input.categorySlug,
    subcategorySlug: input.subcategorySlug,
    level3Slug: input.level3Slug ?? undefined,
  });
  if (!verification.valid) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      console.debug("[applyClassification] Taxonomy invalid:", verification.error);
    }
    return { ok: false, error: verification.error ?? "Taxonomy validation failed." };
  }

  const { data: overrideRow } = await supabaseAdmin
    .from("category_overrides")
    .select("locked")
    .eq("product_id", productId)
    .maybeSingle();
  if ((overrideRow as any)?.locked === true) {
    return { ok: false, error: "Product is locked (category override)." };
  }

  const changeInput: ApplyCategoryChangeInput = {
    productId,
    categorySlug: input.categorySlug,
    subcategorySlug: input.subcategorySlug,
    level3Slug: input.level3Slug ?? undefined,
    listCategory: input.listCategory,
    extraCustomFields: {
      last_auto_categorized_at: new Date().toISOString(),
      auto_categorized_reason: input.reason,
      auto_categorized_source: input.source,
      auto_categorized_version: AUDIT_VERSION,
    },
  };
  const changeResult = await applyCategoryChange(changeInput);
  if (!changeResult.ok) return changeResult;

  const hasAttrs = input.attributes && Object.keys(input.attributes).length > 0;
  const hasBrand = input.brand != null && String(input.brand).trim() !== "";
  const hasModel = input.model != null && String(input.model).trim() !== "";
  if (hasAttrs || hasBrand || hasModel) {
    const payload: Record<string, unknown> = {};
    if (hasBrand) payload.brand = String(input.brand).trim();
    if (hasModel) payload.model = String(input.model).trim();
    if (hasAttrs) {
      const { data: row } = await supabaseAdmin
        .from("products")
        .select("attributes")
        .eq("id", productId)
        .maybeSingle();
      const current = (row as any)?.attributes && typeof (row as any).attributes === "object"
        ? ((row as any).attributes as Record<string, unknown>)
        : {};
      payload.attributes = { ...current, ...(input.attributes as Record<string, unknown>) };
    }
    const { error: updateErr } = await supabaseAdmin
      .from("products")
      .update(payload)
      .eq("id", productId);
    if (updateErr) return { ok: false, error: `Attributes/brand/model update failed: ${updateErr.message}` };
  }

  return { ok: true };
}
