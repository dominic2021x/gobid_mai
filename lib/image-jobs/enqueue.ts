import type { SupabaseClient } from "@supabase/supabase-js";

import { isUrlHostedOnOurR2 } from "@/lib/upload/is-r2-public-url";
import { resolveMirrorUserId } from "@/lib/upload/resolve-mirror-user-id";

/**
 * Inserează job-uri `pending` pentru URL-uri externe de oglinzit în R2.
 * Produsul trebuie deja salvat; worker-ul înlocuiește `replace_source_url` în `products.images`.
 */
export async function enqueueImageMirrorJobsForProduct(
  db: SupabaseClient,
  params: {
    productId: string;
    userId: string | null | undefined;
    imageUrls: readonly string[];
  }
): Promise<void> {
  const uid = resolveMirrorUserId(params.userId);
  if (!uid) {
    console.warn(
      "[image-jobs] Fără user_id și fără R2_SYSTEM_IMPORT_USER_ID — nu se pot enqueua job-uri de mirror."
    );
    return;
  }

  const rows: Array<{
    source_url: string;
    user_id: string;
    status: "pending";
    product_id: string;
    replace_source_url: string;
    max_attempts: number;
  }> = [];

  for (const url of params.imageUrls) {
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) continue;
    if (isUrlHostedOnOurR2(trimmed)) continue;
    rows.push({
      source_url: trimmed,
      user_id: uid,
      status: "pending",
      product_id: params.productId,
      replace_source_url: trimmed,
      max_attempts: 3,
    });
  }

  if (rows.length === 0) return;

  const { error } = await db.from("image_jobs").insert(rows);
  if (error) {
    console.error("[image-jobs] enqueue insert", error);
  }
}
