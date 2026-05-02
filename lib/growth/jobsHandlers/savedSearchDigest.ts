import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Handles saved_search_digest_build jobs. Stores digest candidates for later delivery.
 * saved_search_digest_send_daily / saved_search_digest_send_weekly process the queue.
 */
export async function handleSavedSearchDigestBuild(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const savedSearchId = payload.saved_search_id as string | undefined;
  const userId = payload.user_id as string | undefined;
  const listingIds = payload.listing_ids as string[] | undefined;
  const deliveryMode = (payload.delivery_mode as string) || "daily_digest";

  if (!savedSearchId || !userId || !Array.isArray(listingIds) || listingIds.length === 0) {
    return { ok: true, meta: { skipped: "invalid payload" } };
  }

  if (!["daily_digest", "weekly_digest"].includes(deliveryMode)) {
    return { ok: true, meta: { skipped: "invalid delivery_mode", queued: 0 } };
  }

  try {
    const rows = listingIds
      .filter((id) => typeof id === "string" && id.length > 0)
      .map((listingId) => ({
        saved_search_id: savedSearchId,
        user_id: userId,
        listing_id: listingId,
        delivery_mode: deliveryMode,
      }));

    if (rows.length === 0) {
      return { ok: true, meta: { queued: 0 } };
    }

    const { error } = await supabase.from("saved_search_digest_queue").insert(rows);

    if (error) {
      if (error.code === "42P01") {
        return { ok: true, meta: { queued: 0, note: "digest_queue table not yet migrated" } };
      }
      return { ok: false, error: error.message };
    }

    return { ok: true, meta: { queued: rows.length } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
