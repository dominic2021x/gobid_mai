import type { AssistantContext, DraftFieldName } from "./types";
import { DRAFT_FIELD_WHITELIST } from "./types";

/**
 * Updates a whitelisted field on a product. Only works for products owned by ctx.userId (RLS).
 */
export async function updateDraftField(
  ctx: AssistantContext,
  productId: string,
  field: string,
  value: unknown
): Promise<{ ok: boolean }> {
  if (!DRAFT_FIELD_WHITELIST.includes(field as DraftFieldName)) {
    throw new Error(`updateDraftField: field "${field}" is not allowed`);
  }

  const payload: Record<string, unknown> = { [field]: value };

  if (field === "starting_price" && typeof value === "number") {
    payload.starting_price_ron = value;
    payload.starting_price_eur = value;
  }

  const { data, error } = await ctx.supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .select("id")
    .single();

  if (error) {
    throw new Error(`updateDraftField: ${error.message}`);
  }
  if (!data) {
    throw new Error("updateDraftField: product not found or not owned by user");
  }
  return { ok: true };
}
