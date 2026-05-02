import type { AssistantContext } from "./types";
import { MANDATORY_FIELDS_FOR_PUBLISH } from "./types";

export type ValidateDraftResult = {
  ready: boolean;
  missing: string[];
};

/**
 * Returns list of missing mandatory fields for publish. Same logic as manual form.
 */
export async function validateDraft(
  ctx: AssistantContext,
  productId: string
): Promise<ValidateDraftResult> {
  const { data: row, error } = await ctx.supabase
    .from("products")
    .select("title, description, category, subcategory, starting_price, currency")
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !row) {
    throw new Error("validateDraft: product not found or not owned by user");
  }

  const missing: string[] = [];

  if (!row.title || String(row.title).trim() === "") missing.push("title");
  if (!row.description || String(row.description).trim() === "") missing.push("description");
  if (!row.category || String(row.category).trim() === "") missing.push("category");
  if (!row.subcategory || String(row.subcategory).trim() === "") missing.push("subcategory");

  const price = Number(row.starting_price);
  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
    missing.push("starting_price");
  }

  const currency = String(row.currency || "").trim();
  if (currency !== "RON" && currency !== "EUR") {
    missing.push("currency");
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}
