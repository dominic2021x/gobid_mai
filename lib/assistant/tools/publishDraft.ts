import type { AssistantContext } from "./types";
import { validateDraft } from "./validateDraft";
import { slugify } from "@/lib/slugify";

/**
 * Validates draft then sets status = 'active'. Fails if mandatory fields missing.
 * Ensures slug is set (from title) before publish.
 */
export async function publishDraft(ctx: AssistantContext, productId: string): Promise<{ ok: boolean }> {
  const validation = await validateDraft(ctx, productId);
  if (!validation.ready) {
    throw new Error(
      `publishDraft: missing fields: ${validation.missing.join(", ")}. Complete them first.`
    );
  }

  const { data: row, error: fetchError } = await ctx.supabase
    .from("products")
    .select("title, slug")
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .single();

  if (fetchError || !row) {
    throw new Error("publishDraft: product not found or not owned by user");
  }

  const baseSlug = slugify(String(row.title || "")).slice(0, 60) || `produs-${productId.slice(0, 8)}`;
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await ctx.supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .neq("id", productId)
      .limit(1);
    if (!existing?.length) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { error: updateError } = await ctx.supabase
    .from("products")
    .update({
      status: "active",
      slug,
      url: `/live_bid/${slug}`,
    })
    .eq("id", productId)
    .eq("user_id", ctx.userId);

  if (updateError) {
    throw new Error(`publishDraft: ${updateError.message}`);
  }
  return { ok: true };
}
