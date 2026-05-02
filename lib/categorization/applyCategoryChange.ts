/**
 * Shared logic to apply a single category/subcategory (and optional level3) change to a product.
 * Used by: POST /api/admin/filters-lab/apply and by cron auto-categorize.
 * LP products: category forced to executari, subcategory mapped, custom_fields listing fields updated.
 *
 * Writes the same DB columns that /api/ro/listings uses: products.category, products.subcategory,
 * products.category_level_3. Never only custom_fields — taxonomy is always in DB columns.
 *
 * IMPORTANT: Categorization must NEVER write products.channel or products.requires_token.
 * Channel/access are set by import or migration; taxonomy (category/subcategory/level3) only.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import { getCategoryDefaultImageUrl, isPlaceholderImage } from "@/lib/getProductDisplayImage";
import { normalizeSlugForCompare } from "@/lib/text/normalizeRo";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";

export type ApplyCategoryChangeInput = {
  productId: string;
  categorySlug: string;
  subcategorySlug?: string;
  level3Slug?: string;
  /** Level4: doar terenuri / exec-imobiliare – intravilan | extravilan */
  level4Slug?: string | null;
  listCategory?: string;
  /** Merged into custom_fields on update (e.g. last_auto_categorized_at, auto_categorized_reason for cron). */
  extraCustomFields?: Record<string, unknown>;
};

export type ApplyCategoryChangeResult = { ok: boolean; error?: string };

function slugNorm(value: string): string {
  return normalizeSlugForCompare(value || "");
}

function isCategoryMatch(dbCategory: string, expectedSlug: string): boolean {
  const dbNorm = slugNorm(dbCategory);
  const slugNormVal = slugNorm(expectedSlug);
  const displayNorm = slugNorm(RO_CATEGORIES[expectedSlug]?.name || "");
  return dbNorm === slugNormVal || (Boolean(displayNorm) && dbNorm === displayNorm);
}

function isSubcategoryMatch(dbSubcategory: string, expectedSlug: string): boolean {
  const dbNorm = slugNorm(dbSubcategory);
  const slugNormVal = slugNorm(expectedSlug);
  const displayNorm = slugNorm(RO_SUBCATEGORY_NAMES[expectedSlug] || "");
  return dbNorm === slugNormVal || (Boolean(displayNorm) && dbNorm === displayNorm);
}

const EXEC_SUBCATEGORY_SET = new Set(RO_CATEGORIES.executari?.subcategories || []);

function isLicitatiiPubliceProduct(product: any): boolean {
  const productType = slugNorm(String(product?.product_type || ""));
  const saleType = slugNorm(String(product?.sale_type || ""));
  return productType === "licitatii-publice" || saleType === "licitatii-insolventa" || saleType === "licitatie-publica";
}

function mapToExecutariSubcategory(input: string): string {
  const normalized = slugNorm(input);
  if (EXEC_SUBCATEGORY_SET.has(normalized)) return normalized;
  const genericToExec: Record<string, string> = {
    apartamente: "exec-imobiliare",
    "case-vile": "exec-imobiliare",
    "terenuri-intravilane": "exec-imobiliare",
    "terenuri-extravilane": "exec-imobiliare",
    "terenuri-agricole": "exec-imobiliare",
    "spatii-comerciale": "exec-imobiliare",
    "hale-industriale": "exec-imobiliare",
    autoturisme: "exec-autovehicule",
    "suv-4x4": "exec-autovehicule",
    motociclete: "exec-autovehicule",
    camioane: "exec-autovehicule",
    remorci: "exec-autovehicule",
    "piese-auto": "exec-autovehicule",
    "utilaje-constructii": "exec-industrial",
    "utilaje-agricole": "exec-industrial",
    "tractoare-combine": "exec-industrial",
    "echipamente-electrice": "exec-industrial",
    "echipamente-birou": "exec-office",
    "lichidari-firme": "exec-afaceri",
    "loturi-stocuri": "oferte-grupate",
  };
  return genericToExec[normalized] || "exec-altele";
}

function isGoogleMapsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  return (u.includes("google") && u.includes("maps")) || u.includes("goo.gl/maps");
}

function isCategoryDefaultImage(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("/images/category-defaults/");
}

function hasRealProductImage(row: any): boolean {
  const images = Array.isArray(row?.images) ? row.images : [];
  const urls: string[] = [];
  for (const item of images) {
    if (typeof item === "string") urls.push(item);
    else if (item && typeof item === "object" && typeof (item as any).url === "string") urls.push((item as any).url);
  }
  return urls.some((url) => {
    const s = String(url || "").trim();
    if (!s) return false;
    if (isGoogleMapsUrl(s)) return false;
    if (isPlaceholderImage(s)) return false;
    if (isCategoryDefaultImage(s)) return false;
    return true;
  });
}

/**
 * Apply one category change to a product. Idempotent if already at target.
 * For LP products: enforces category=executari and custom_fields listing fields.
 */
export async function applyCategoryChange(change: ApplyCategoryChangeInput): Promise<ApplyCategoryChangeResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: "Supabase admin client not configured." };
  }

  const subcategorySlug = (change.subcategorySlug ?? "").trim() || change.categorySlug;
  const productId = String(change.productId || "").trim();
  if (!productId || !change.categorySlug) {
    return { ok: false, error: "Missing productId or categorySlug." };
  }

  const { data: beforeRow, error: beforeErr } = await supabaseAdmin
    .from("products")
    .select("id, category, subcategory, category_level_3, category_level_4, images, product_type, sale_type, custom_fields")
    .eq("id", productId)
    .maybeSingle();

  if (beforeErr) return { ok: false, error: `Lookup failed: ${beforeErr.message}` };
  if (!beforeRow || !(beforeRow as any).id) return { ok: false, error: "Product not found." };

  const beforeCategory = String((beforeRow as any).category || "");
  const beforeSubcategory = String((beforeRow as any).subcategory || "");
  const isLicitatiiPublice = isLicitatiiPubliceProduct(beforeRow);
  const targetCategory = isLicitatiiPublice ? "executari" : change.categorySlug;
  const targetSubcategory = isLicitatiiPublice ? mapToExecutariSubcategory(subcategorySlug) : subcategorySlug;
  const targetLevel3 = change.level3Slug ?? (beforeRow as any).category_level_3 ?? null;
  const targetLevel4 = change.level4Slug !== undefined ? change.level4Slug : ((beforeRow as any).category_level_4 ?? null);

  const verification = verifyTaxonomy({
    categorySlug: targetCategory,
    subcategorySlug: targetSubcategory,
    level3Slug: change.level3Slug ?? undefined,
    level4Slug: change.level4Slug ?? undefined,
  });
  if (!verification.valid) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      console.debug("[applyCategoryChange] Taxonomy invalid, skip apply:", verification.error);
    }
    return { ok: false, error: verification.error ?? "Taxonomy validation failed." };
  }

  const currentCustomFields =
    ((beforeRow as any).custom_fields && typeof (beforeRow as any).custom_fields === "object")
      ? ((beforeRow as any).custom_fields as Record<string, unknown>)
      : {};
  const beforeListCategory = String((currentCustomFields as any).listing_category || "").trim();
  const isExecImobiliare = targetCategory === "executari" && targetSubcategory === "exec-imobiliare";
  const targetListCategory =
    isExecImobiliare ? (change.listCategory ?? beforeListCategory ?? "").trim() : "";

  const alreadyOk =
    isCategoryMatch(beforeCategory, targetCategory) &&
    isSubcategoryMatch(beforeSubcategory, targetSubcategory) &&
    (!isExecImobiliare || slugNorm(beforeListCategory) === slugNorm(targetListCategory)) &&
    (change.level3Slug == null || String((beforeRow as any).category_level_3 || "").trim() === String(change.level3Slug || "").trim()) &&
    (change.level4Slug === undefined || String((beforeRow as any).category_level_4 || "").trim() === String(change.level4Slug || "").trim());

  if (alreadyOk) return { ok: true };

  // Same columns as /api/ro/listings filters: category, subcategory, category_level_3, category_level_4. Never only custom_fields.
  const updatePayload: Record<string, unknown> = {
    category: targetCategory,
    subcategory: targetSubcategory,
  };
  if (change.level3Slug !== undefined) {
    updatePayload.category_level_3 = change.level3Slug || null;
  }
  if (change.level4Slug !== undefined) {
    updatePayload.category_level_4 = change.level4Slug || null;
  }
  if (!hasRealProductImage(beforeRow)) {
    const imageCategory = isLicitatiiPublice ? null : targetCategory;
    const imageSubcategory = isLicitatiiPublice ? (targetListCategory || targetSubcategory) : targetSubcategory;
    updatePayload.images = [getCategoryDefaultImageUrl(imageCategory, imageSubcategory)];
  }
  const mergedCustomFields: Record<string, unknown> = {
    ...currentCustomFields,
    ...(change.extraCustomFields || {}),
  };
  if (isLicitatiiPublice) {
    Object.assign(mergedCustomFields, {
      listing_main_category: "Executări și Insolvență",
      main_category: "Executări și Insolvență",
    });
  }
  if (isExecImobiliare && targetListCategory) {
    mergedCustomFields.listing_category = targetListCategory;
  }
  if (change.extraCustomFields && Object.keys(change.extraCustomFields).length > 0) {
    mergedCustomFields.audit = {
      ...(typeof mergedCustomFields.audit === "object" && mergedCustomFields.audit !== null
        ? (mergedCustomFields.audit as Record<string, unknown>)
        : {}),
      reason: (change.extraCustomFields as any).auto_categorized_reason ?? "category_change",
      version: 1,
      timestamp: new Date().toISOString(),
    };
  }
  if (Object.keys(mergedCustomFields).length > 0) {
    updatePayload.custom_fields = mergedCustomFields;
  }

  const { error: updateErr } = await supabaseAdmin.from("products").update(updatePayload).eq("id", productId);
  if (updateErr) return { ok: false, error: `Update failed: ${updateErr.message}` };

  const { data: afterRow, error: afterErr } = await supabaseAdmin
    .from("products")
    .select("id, category, subcategory, category_level_3, category_level_4, custom_fields")
    .eq("id", productId)
    .maybeSingle();

  if (afterErr) return { ok: false, error: `Post-update read failed: ${afterErr.message}` };
  if (!afterRow || !(afterRow as any).id) return { ok: false, error: "No row after update." };

  const finalCategory = String((afterRow as any).category || "");
  const finalSubcategory = String((afterRow as any).subcategory || "");
  const finalCustomFields =
    ((afterRow as any).custom_fields && typeof (afterRow as any).custom_fields === "object")
      ? ((afterRow as any).custom_fields as Record<string, unknown>)
      : {};
  const finalListCategory = String((finalCustomFields as any).listing_category || "").trim();
  const finalLevel3 = String((afterRow as any).category_level_3 || "").trim();
  const finalLevel4 = String((afterRow as any).category_level_4 || "").trim();
  if (
    !isCategoryMatch(finalCategory, targetCategory) ||
    !isSubcategoryMatch(finalSubcategory, targetSubcategory) ||
    (isExecImobiliare && slugNorm(finalListCategory) !== slugNorm(targetListCategory)) ||
    (change.level3Slug != null && finalLevel3 !== String(change.level3Slug || "").trim()) ||
    (change.level4Slug !== undefined && finalLevel4 !== String(change.level4Slug || "").trim())
  ) {
    return {
      ok: false,
      error: `DB differs after update. category="${finalCategory}" subcategory="${finalSubcategory}" list_category="${finalListCategory}" level3="${finalLevel3}" level4="${finalLevel4}"`,
    };
  }

  return { ok: true };
}
