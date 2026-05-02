/**
 * Sincronizează statusul produselor publicate pe site când listing-urile repes
 * sunt dezactivate (deleted_at) sau reactivate.
 */

import { supabaseAdmin } from "@/lib/supabase";

export async function syncRepesProductStatusForListings(
  listingIds: string[],
  deleted: boolean
): Promise<{ updated: number }> {
  if (!supabaseAdmin || listingIds.length === 0) return { updated: 0 };

  const status = deleted ? "in_progress" : "active";

  try {
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from("repes_listings")
      .select("product_id")
      .in("id", listingIds)
      .not("product_id", "is", null);

    if (fetchError || !rows?.length) return { updated: 0 };

    const productIds = (rows as { product_id: string | null }[])
      .map((r) => r.product_id)
      .filter(Boolean) as string[];
    if (productIds.length === 0) return { updated: 0 };

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", productIds);

    if (updateError) {
      console.warn("[repes-sync-products]", updateError.message);
      return { updated: 0 };
    }
    return { updated: productIds.length };
  } catch (e) {
    console.warn("[repes-sync-products]", e);
    return { updated: 0 };
  }
}
