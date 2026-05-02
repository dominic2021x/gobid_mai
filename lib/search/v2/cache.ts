/**
 * Search query cache: read/write with expires_at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_TTL_SECONDS = 120;

export function buildCacheKey(qNorm: string, filters: Record<string, unknown>, page: number): string {
  const parts = [qNorm, String(page)];
  const keys = Object.keys(filters).sort();
  for (const k of keys) {
    const v = filters[k];
    if (v !== undefined && v !== null && v !== "") parts.push(`${k}=${String(v)}`);
  }
  return parts.join("|").slice(0, 500);
}

export async function getCached(
  supabase: SupabaseClient,
  key: string
): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("search_query_cache")
    .select("result")
    .eq("key", key)
    .gt("expires_at", now)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { result: Record<string, unknown> }).result ?? null;
}

export async function setCached(
  supabase: SupabaseClient,
  key: string,
  result: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_SECONDS * 1000).toISOString();
  await supabase.from("search_query_cache").upsert(
    { key, result, expires_at: expiresAt, created_at: now.toISOString() },
    { onConflict: "key" }
  );
}
