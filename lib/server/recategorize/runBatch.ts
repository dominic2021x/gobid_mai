/**
 * Shared recategorization batch: select products, classify, apply or suggest.
 * Returns summary + optional detailed log of each change (for admin panel).
 */

import { supabaseAdmin } from "@/lib/supabase";
import { classify } from "@/lib/categorization/engine";
import { applyClassification } from "@/lib/categorization/apply";
import { DEFAULT_STATUS } from "@/lib/server/products/listingsWhere";

const BATCH_SIZE = 200;
const LISTING_STATUSES = [...DEFAULT_STATUS];
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type RecategorizeChange = {
  productId: string;
  title: string;
  oldCategory: string;
  oldSubcategory: string;
  oldLevel3: string | null;
  newCategory: string;
  newSubcategory: string;
  newLevel3: string | null;
  reason: string;
  source: string;
  applied: boolean;
};

export type RunRecategorizeBatchResult = {
  success: boolean;
  scanned: number;
  applied: number;
  skipped: number;
  errors: string[];
  /** Detalii per produs (doar când verbose). */
  changes: RecategorizeChange[];
};

export async function runRecategorizeBatch(verbose = false): Promise<RunRecategorizeBatchResult> {
  const changes: RecategorizeChange[] = [];

  if (!supabaseAdmin) {
    return {
      success: false,
      scanned: 0,
      applied: 0,
      skipped: 0,
      errors: ["Supabase admin not configured"],
      changes: [],
    };
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

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("products")
    .select("id, title, description, category, subcategory, category_level_3, brand, model, custom_fields")
    .eq("channel", "executari_insolventa")
    .in("status", LISTING_STATUSES)
    .or("category.is.null,category.eq.diverse,subcategory.is.null,subcategory.ilike.exec-%")
    .not("title", "is", null)
    .limit(400);

  if (fetchError) {
    return {
      success: false,
      scanned: 0,
      applied: 0,
      skipped: 0,
      errors: [fetchError.message],
      changes: [],
    };
  }

  const lockedSet = new Set(lockedIds);
  const now = Date.now();
  const products = (rows ?? [])
    .filter((p: Record<string, unknown>) => {
      if (lockedSet.has(String(p?.id ?? ""))) return false;
      const t = String(p?.title ?? "").trim();
      if (!t) return false;
      const cf = p?.custom_fields && typeof p.custom_fields === "object" ? (p.custom_fields as Record<string, unknown>) : {};
      const lastAt = cf?.last_auto_categorized_at;
      if (lastAt && typeof lastAt === "string") {
        const ts = new Date(lastAt).getTime();
        if (Number.isFinite(ts) && now - ts < COOLDOWN_MS) return false;
      }
      return true;
    })
    .slice(0, BATCH_SIZE);

  let applied = 0;
  let skipped = (rows ?? []).length - products.length;
  const errors: string[] = [];

  for (const p of products) {
    const id = String((p as Record<string, unknown>).id ?? "");
    const title = String((p as Record<string, unknown>).title ?? "").trim();
    const oldCategory = String((p as Record<string, unknown>).category ?? "");
    const oldSubcategory = String((p as Record<string, unknown>).subcategory ?? "");
    const oldLevel3 = (p as Record<string, unknown>).category_level_3 != null
      ? String((p as Record<string, unknown>).category_level_3)
      : null;

    const input = {
      id,
      title,
      description: (p as Record<string, unknown>).description != null ? String((p as Record<string, unknown>).description) : undefined,
      currentCategory: oldCategory,
      currentSubcategory: oldSubcategory,
      currentLevel3: oldLevel3 ?? undefined,
      custom_fields: (p as Record<string, unknown>).custom_fields as Record<string, unknown> | undefined,
    };

    const result = classify(input);
    if (!result) {
      skipped += 1;
      if (verbose) {
        changes.push({
          productId: id,
          title,
          oldCategory,
          oldSubcategory,
          oldLevel3,
          newCategory: "-",
          newSubcategory: "-",
          newLevel3: null,
          reason: "Fără clasificare (confidence < 0.9)",
          source: "-",
          applied: false,
        });
      }
      continue;
    }

    if (result.confidence === 1) {
      const applyResult = await applyClassification({
        productId: id,
        categorySlug: result.categorySlug,
        subcategorySlug: result.subcategorySlug,
        level3Slug: result.level3Slug ?? null,
        attributes: result.attributes && Object.keys(result.attributes).length > 0 ? result.attributes : undefined,
        brand: result.brand ?? null,
        model: result.model ?? null,
        reason: result.reason,
        source: result.source,
      });
      if (applyResult.ok) {
        applied += 1;
        if (verbose) {
          changes.push({
            productId: id,
            title,
            oldCategory: oldCategory || "(gol)",
            oldSubcategory: oldSubcategory || "(gol)",
            oldLevel3,
            newCategory: result.categorySlug,
            newSubcategory: result.subcategorySlug,
            newLevel3: result.level3Slug ?? null,
            reason: result.reason,
            source: result.source,
            applied: true,
          });
        }
      } else {
        errors.push(`${id}: ${applyResult.error ?? "apply failed"}`);
        if (verbose) {
          changes.push({
            productId: id,
            title,
            oldCategory: oldCategory || "(gol)",
            oldSubcategory: oldSubcategory || "(gol)",
            oldLevel3,
            newCategory: result.categorySlug,
            newSubcategory: result.subcategorySlug,
            newLevel3: result.level3Slug ?? null,
            reason: `Eroare: ${applyResult.error ?? "apply failed"}`,
            source: result.source,
            applied: false,
          });
        }
      }
    } else {
      skipped += 1;
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
      } catch (e: unknown) {
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : String(e);
        if (msg && !msg.includes("42P01")) errors.push(`${id}: suggestion ${msg}`);
      }
      if (verbose) {
        changes.push({
          productId: id,
          title,
          oldCategory: oldCategory || "(gol)",
          oldSubcategory: oldSubcategory || "(gol)",
          oldLevel3,
          newCategory: result.categorySlug,
          newSubcategory: result.subcategorySlug,
          newLevel3: result.level3Slug ?? null,
          reason: `${result.reason} (sugestie, ${(result.confidence * 100).toFixed(0)}%)`,
          source: result.source,
          applied: false,
        });
      }
    }
  }

  return {
    success: true,
    scanned: products.length,
    applied,
    skipped,
    errors: errors.slice(0, 50),
    changes,
  };
}
