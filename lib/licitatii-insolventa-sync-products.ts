/**
 * Sincronizează statusul produselor publicate pe site când listing-urile licitatii_insolventa
 * sunt dezactivate (deleted_at) sau reactivate. LIVE: ce se schimbă în admin se reflectă pe site.
 */

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Pentru listările cu product_id setat: actualizează produsul legat la status 'in_progress' sau 'active'.
 * - deleted === true → product.status = 'in_progress' (afișează "În curs" verde pe site, sincronizat cu admin)
 * - deleted === false → product.status = 'active'
 */
export async function syncProductStatusForListings(
  listingIds: string[],
  deleted: boolean
): Promise<{ updated: number }> {
  if (!supabaseAdmin || listingIds.length === 0) return { updated: 0 };

  const status = deleted ? "in_progress" : "active";

  try {
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from("licitatii_insolventa_listings")
      .select("product_id")
      .in("id", listingIds)
      .not("product_id", "is", null);

    if (fetchError || !rows?.length) return { updated: 0 };

    const productIds = rows
      .map((r: { product_id: string | null }) => r.product_id)
      .filter(Boolean) as string[];
    if (productIds.length === 0) return { updated: 0 };

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", productIds);

    if (updateError) {
      console.warn("[licitatii-insolventa-sync-products]", updateError.message);
      return { updated: 0 };
    }
    return { updated: productIds.length };
  } catch (e) {
    console.warn("[licitatii-insolventa-sync-products]", e);
    return { updated: 0 };
  }
}
