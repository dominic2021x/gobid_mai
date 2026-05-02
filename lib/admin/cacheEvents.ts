/**
 * Server-only: log cache operations to cache_events for admin panel observability.
 * Target normalization: tag:<name> | path:<path> | layout:<segment> | warmup:<label>
 */

import { supabaseAdmin } from "@/lib/supabase";

export type CacheOperationType = "clear_cache" | "revalidate_path" | "revalidate_tag" | "warmup" | "cleanup";
export type CacheEventStatus = "ok" | "error" | "partial";

const TARGET_PREFIX: Record<CacheOperationType, string> = {
  clear_cache: "",
  revalidate_path: "path:",
  revalidate_tag: "tag:",
  warmup: "warmup:",
  cleanup: "",
};

function normalizeTarget(type: CacheOperationType, target: string | null | undefined): string {
  const raw = (target ?? "").trim() || "unknown";
  if (/^(tag|path|layout|warmup):/.test(raw)) return raw;
  const prefix = TARGET_PREFIX[type];
  return prefix ? `${prefix}${raw}` : raw;
}

function normalizeStatus(status: string): CacheEventStatus {
  const s = (status ?? "ok").toLowerCase();
  if (s === "error" || s === "partial") return s;
  return "ok";
}

export async function logCacheEvent(params: {
  type: CacheOperationType;
  target?: string | null;
  status: string;
  duration_ms?: number | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const target = normalizeTarget(params.type, params.target);
    const status = normalizeStatus(params.status);
    await supabaseAdmin.from("cache_events").insert({
      type: params.type,
      target,
      status,
      duration_ms: params.duration_ms ?? null,
      meta: params.meta ?? {},
    });
  } catch {
    // non-fatal
  }
}

/** Strip prefix from target for display (tag:, path:, layout:, warmup:). */
export function targetDisplay(target: string | null | undefined): string {
  if (target == null || !target) return "—";
  const m = target.match(/^(?:tag|path|layout|warmup):(.+)$/);
  return m ? m[1] : target;
}
