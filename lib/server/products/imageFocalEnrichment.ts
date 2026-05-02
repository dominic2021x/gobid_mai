/**
 * Attach `image_focal_by_url` to product-shaped rows using `uploaded_images` (public_url → focal).
 * Server-only; batch-friendly for listings.
 */

import type { ImageFocalEntry } from "@/lib/image/focal-types";
import { supabaseAdmin } from "@/lib/supabase";
import { isRetryablePostgrestError, runPostgrestQuery } from "@/lib/server/supabase/postgrest";

export type { ImageFocalEntry };

const FOCAL_CACHE_TTL_MS = 5 * 60 * 1000;
const focalCache = new Map<string, { value: ImageFocalEntry | null; expiresAt: number }>();

function summarizeFocalEnrichmentError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    status: error.status,
  };
}

export async function enrichItemsWithImageFocal(items: Record<string, unknown>[]): Promise<void> {
  if (!supabaseAdmin || items.length === 0) return;
  const adminClient = supabaseAdmin;

  const urls = new Set<string>();
  for (const p of items) {
    const imgs = p.images;
    if (!Array.isArray(imgs)) continue;
    for (const u of imgs) {
      if (typeof u === "string" && u.startsWith("http")) urls.add(u);
    }
  }
  if (urls.size === 0) return;

  const list = [...urls];
  const chunkSize = 150;
  const now = Date.now();
  const map = new Map<string, ImageFocalEntry>();
  const missing: string[] = [];

  for (const url of list) {
    const cached = focalCache.get(url);
    if (cached && cached.expiresAt > now) {
      if (cached.value) map.set(url, cached.value);
      continue;
    }
    missing.push(url);
  }

  for (let i = 0; i < missing.length; i += chunkSize) {
    const slice = missing.slice(i, i + chunkSize);
    const { data, error } = await runPostgrestQuery<{ public_url: string; focal_x: number | null; focal_y: number | null }[]>(
      (signal) =>
        adminClient
          .from("uploaded_images")
          .select("public_url, focal_x, focal_y")
          .in("public_url", slice)
          .is("deleted_at", null)
          .abortSignal(signal),
      { timeoutMs: 1500, maxRetries: 0 }
    );

    if (error) {
      if (!isRetryablePostgrestError(error)) {
        console.warn("[imageFocalEnrichment] skipped focal lookup", summarizeFocalEnrichmentError(error));
      }
      return;
    }
    const expiresAt = Date.now() + FOCAL_CACHE_TTL_MS;
    for (const url of slice) {
      focalCache.set(url, { value: null, expiresAt });
    }
    for (const row of data ?? []) {
      const url = row.public_url as string;
      const fx = row.focal_x;
      const fy = row.focal_y;
      if (fx != null && fy != null && Number.isFinite(Number(fx)) && Number.isFinite(Number(fy))) {
        const value = { focal_x: Number(fx), focal_y: Number(fy) };
        map.set(url, value);
        focalCache.set(url, { value, expiresAt });
      }
    }
  }

  for (const p of items) {
    const imgs = p.images;
    if (!Array.isArray(imgs)) continue;
    const focal: Record<string, ImageFocalEntry> = {};
    for (const u of imgs) {
      if (typeof u !== "string") continue;
      const f = map.get(u);
      if (f) focal[u] = f;
    }
    if (Object.keys(focal).length > 0) {
      p.image_focal_by_url = focal;
    }
  }
}
