import type { AssistantContext } from "./types";

/**
 * Deletes a product only if it is owned by the user and status is 'draft'.
 * RLS must allow DELETE for own draft products; this adds server-side guards.
 */
export async function deleteDraft(ctx: AssistantContext, productId: string): Promise<{ ok: boolean }> {
  const { data: row, error: fetchError } = await ctx.supabase
    .from("products")
    .select("id, user_id, status")
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .single();

  if (fetchError || !row) {
    throw new Error("deleteDraft: produs negăsit sau nu îți aparține.");
  }

  if (row.status !== "draft") {
    throw new Error("deleteDraft: poți șterge doar drafturi (status draft). Acest anunț nu este draft.");
  }

  const { error: deleteError } = await ctx.supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .eq("status", "draft");

  if (deleteError) {
    throw new Error(`deleteDraft: ${deleteError.message}`);
  }

  return { ok: true };
}
