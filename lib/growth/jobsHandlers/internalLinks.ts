import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePath } from "@/lib/urls/normalizePath";

const MAX_LINKS_PER_RUN = 50;
const MAX_LINKS_PER_SOURCE = 2;
const MIN_ANCHOR_LEN = 4;
const MAX_ANCHOR_LEN = 60;
const MAX_LINKS_PER_SOURCE_TARGET = 2;

export async function handleSeoInternalLinksGenerate(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: snap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "seo")
      .eq("kind", "internal_link_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const result = snap?.result as { plans?: Array<{ targetUrl?: string; sourceUrls?: string[]; suggestedAnchors?: string[] }> } | null;
    const plans = Array.isArray(result?.plans) ? result.plans : [];
    const candidates: { source_url: string; target_url: string; anchor: string }[] = [];
    for (const plan of plans) {
      const targetUrl = typeof plan.targetUrl === "string" ? plan.targetUrl.trim() : "";
      const sourceUrls = Array.isArray(plan.sourceUrls) ? plan.sourceUrls : [];
      const anchors = Array.isArray(plan.suggestedAnchors) ? plan.suggestedAnchors.filter((a): a is string => typeof a === "string").filter(Boolean) : [];
      const anchor = anchors[0] ?? "Află mai multe";
      const targetPath = normalizePath(targetUrl);
      if (!targetPath || targetPath === "/") continue;
      for (const src of sourceUrls) {
        const sourcePath = normalizePath(src);
        if (!sourcePath || sourcePath === targetPath) continue;
        candidates.push({ source_url: sourcePath, target_url: targetPath, anchor });
      }
    }
    const bySource = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const list = bySource.get(c.source_url) ?? [];
      if (list.length < MAX_LINKS_PER_SOURCE) list.push(c);
      bySource.set(c.source_url, list);
    }
    const toInsert: { source_url: string; target_url: string; anchor: string }[] = [];
    for (const list of bySource.values()) {
      for (const link of list) {
        if (toInsert.length >= MAX_LINKS_PER_RUN) break;
        toInsert.push(link);
      }
      if (toInsert.length >= MAX_LINKS_PER_RUN) break;
    }
    if (toInsert.length === 0) {
      await supabase.from("growth_events").insert({
        type: "seo_internal_links_generate",
        meta: { correlationId, inserted: 0, reason: "no_candidates" },
      });
      return { ok: true, meta: { inserted: 0 } };
    }
    const rows = toInsert.map((r) => ({
      source_url: r.source_url,
      target_url: r.target_url,
      anchor: r.anchor,
      status: "draft",
    }));
    const { error } = await supabase.from("seo_internal_links").insert(rows);
    if (error) throw error;
    await supabase.from("growth_events").insert({
      type: "seo_internal_links_generate",
      meta: { correlationId, inserted: rows.length },
    });
    return { ok: true, meta: { inserted: rows.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_internal_links_generate_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleSeoInternalLinksApply(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: drafts, error: fetchErr } = await supabase
      .from("seo_internal_links")
      .select("id, source_url, target_url, anchor")
      .eq("status", "draft");
    if (fetchErr) throw fetchErr;
    const rows = (drafts ?? []) as Array<{ id: string; source_url: string; target_url: string; anchor: string }>;
    if (rows.length === 0) {
      await supabase.from("growth_events").insert({
        type: "seo_internal_links_apply",
        meta: { correlationId, applied: 0, skipped: 0, reason: "no_drafts" },
      });
      return { ok: true, meta: { applied: 0, skipped: 0 } };
    }

    let skippedTargetEqualsSource = 0;
    let skippedAnchorLength = 0;
    const bySourceTarget = new Map<string, Array<{ id: string }>>();
    const toApply: string[] = [];
    const toRemove: string[] = [];

    for (const r of rows) {
      const source = normalizePath(r.source_url);
      const target = normalizePath(r.target_url);
      if (source === target) {
        skippedTargetEqualsSource++;
        toRemove.push(r.id);
        continue;
      }
      const anchorLen = (r.anchor ?? "").trim().length;
      if (anchorLen < MIN_ANCHOR_LEN || anchorLen > MAX_ANCHOR_LEN) {
        skippedAnchorLength++;
        toRemove.push(r.id);
        continue;
      }
      const key = `${source}\0${target}`;
      const list = bySourceTarget.get(key) ?? [];
      list.push({ id: r.id });
      bySourceTarget.set(key, list);
    }

    for (const list of bySourceTarget.values()) {
      const kept = list.slice(0, MAX_LINKS_PER_SOURCE_TARGET);
      const excess = list.slice(MAX_LINKS_PER_SOURCE_TARGET);
      toApply.push(...kept.map((x) => x.id));
      toRemove.push(...excess.map((x) => x.id));
    }
    const skippedDuplicate = toRemove.length - skippedTargetEqualsSource - skippedAnchorLength;

    if (toRemove.length > 0) {
      await supabase.from("seo_internal_links").update({ status: "removed" }).in("id", toRemove);
    }
    if (toApply.length > 0) {
      await supabase.from("seo_internal_links").update({ status: "applied" }).in("id", toApply);
    }

    await supabase.from("growth_events").insert({
      type: "seo_internal_links_apply",
      meta: {
        correlationId,
        applied: toApply.length,
        skipped: toRemove.length,
        skippedTargetEqualsSource,
        skippedAnchorLength,
        skippedDuplicate,
      },
    });
    return { ok: true, meta: { applied: toApply.length, skipped: toRemove.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_internal_links_apply_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
