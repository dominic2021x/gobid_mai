import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SeoOverridePatch {
  url: string;
  title?: string;
  meta?: string;
}

const MAX_PATCHES = 100;

export async function handleSeoApplyOverrides(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const raw = payload.patches;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: true, meta: { applied: 0, reason: "no_patches" } };
  }
  const patches = raw
    .slice(0, MAX_PATCHES)
    .map((p) => {
      if (p == null || typeof p !== "object") return null;
      const o = p as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      if (!url) return null;
      return {
        url,
        title: typeof o.title === "string" ? o.title.trim() || null : null,
        meta: typeof o.meta === "string" ? o.meta.trim() || null : null,
      } as { url: string; title: string | null; meta: string | null };
    })
    .filter((p): p is { url: string; title: string | null; meta: string | null } => p !== null);

  if (patches.length === 0) {
    return { ok: true, meta: { applied: 0, reason: "no_valid_patches" } };
  }

  try {
    for (const p of patches) {
      await supabase.from("seo_overrides").upsert(
        {
          url: p.url,
          title: p.title ?? null,
          meta: p.meta ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "url" }
      );
    }
    await supabase.from("growth_events").insert({
      type: "seo_apply_overrides",
      meta: { correlationId, patchCount: patches.length, urls: patches.map((p) => p.url) },
    });
    return { ok: true, meta: { applied: patches.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_apply_overrides_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
