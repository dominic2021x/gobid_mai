import type { AssistantContext } from "./types";

/**
 * Inserts a new product with status 'draft' and minimal fields.
 * user_id is set from context (session); RLS enforces ownership.
 */
export async function createDraftListing(ctx: AssistantContext): Promise<{ productId: string }> {
  const id = crypto.randomUUID().slice(0, 8);
  const slug = `draft-${id}`;
  const sku = `DRAFT-${id}-${Date.now().toString(36)}`;
  const { data, error } = await ctx.supabase
    .from("products")
    .insert({
      user_id: ctx.userId,
      title: "Draft anunț",
      description: "",
      status: "draft",
      slug,
      url: `/live_bid/${slug}`,
      sku,
      product_type: "live-bid",
      channel: "ro",
      requires_token: false,
      starting_price: 0,
      starting_price_ron: 0,
      starting_price_eur: 0,
      currency: "RON",
      category: "",
      subcategory: "",
      images: [],
      custom_fields: {},
      seo: { title: "", description: "", keywords: [] },
      documents: [],
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`createDraftListing: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("createDraftListing: no id returned");
  }
  return { productId: data.id };
}
