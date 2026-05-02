import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSettingNumber, GROWTH_SETTING_KEYS } from "@/lib/growth/settings";
import { normalizeQuery } from "@/lib/growth/demand/normalize";
import { detectCountySlug } from "@/lib/growth/demand/geo";
import { mapQueryToCategorySlug } from "@/lib/growth/demand/taxonomyMap";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import { normalizePath } from "@/lib/urls/normalizePath";

const LP_PREFIX = "/ro/lp/";
const HUB_PREFIX = "/ro/hub/";
const DEFAULT_SPIKE_MULTIPLIER = 2.0;
const DEFAULT_MIN_BASELINE = 10;
const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_CREATE_LP_LIMIT = 10;
const DEFAULT_SEED_LINKS_LIMIT = 30;
const MS_7D = 7 * 86400 * 1000;
const SEARCH_QUERIES_LIMIT = 30000;

function slugFromQueryNorm(qNorm: string): string {
  return qNorm
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "cautare";
}

function classifyIntent(queryNorm: string, categorySlug: string | null): string {
  if (categorySlug) return "commercial";
  if (queryNorm.split(/\s+/).length <= 2) return "navigational";
  return "informational";
}

function getCountyNameMap(): Map<string, string> {
  try {
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const p = path.join(process.cwd(), "judete.json");
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as { judete?: Array<{ nume?: string }> };
    const map = new Map<string, string>();
    for (const j of data.judete ?? []) {
      const name = (j.nume ?? "").trim();
      if (!name) continue;
      const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      map.set(slug, name);
    }
    return map;
  } catch {
    return new Map<string, string>();
  }
}

export async function handleMarketTrendsRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const spikeMultiplier = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.trends_spike_multiplier, DEFAULT_SPIKE_MULTIPLIER);
    const minBaseline = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.trends_min_baseline, DEFAULT_MIN_BASELINE);
    const maxItems = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.trends_max_items, DEFAULT_MAX_ITEMS);

    const now = Date.now();
    const recentStart = new Date(now - MS_7D).toISOString();
    const baselineEnd = new Date(now - MS_7D).toISOString();
    const baselineStart = new Date(now - 2 * MS_7D).toISOString();

    const [gscSnapsRes, internalRecentRes, internalBaselineRes, existingLps, existingItems] = await Promise.all([
      supabase.from("growth_google_snapshots").select("result, created_at").eq("product", "search_console").eq("kind", "performance_overview").order("created_at", { ascending: false }).limit(10),
      supabase.from("search_queries").select("q_norm").gte("created_at", recentStart).limit(SEARCH_QUERIES_LIMIT),
      supabase.from("search_queries").select("q_norm").gte("created_at", baselineStart).lt("created_at", baselineEnd).limit(SEARCH_QUERIES_LIMIT),
      supabase.from("seo_landing_pages").select("slug"),
      supabase.from("growth_trend_items").select("key, status"),
    ]);

    const gscSnaps = gscSnapsRes.data ?? [];
    const latestGsc = gscSnaps[0] as { result?: { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number }> }; created_at?: string } | undefined;
    const baselineGsc = gscSnaps.find((s: { created_at?: string }) => s.created_at && new Date(s.created_at).getTime() < now - MS_7D) as { result?: { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number }> } } | undefined;

    const byNormInternalRecent = new Map<string, number>();
    for (const row of internalRecentRes.data ?? []) {
      const n = (row as { q_norm: string }).q_norm?.trim();
      if (!n) continue;
      byNormInternalRecent.set(n, (byNormInternalRecent.get(n) ?? 0) + 1);
    }
    const byNormInternalBaseline = new Map<string, number>();
    for (const row of internalBaselineRes.data ?? []) {
      const n = (row as { q_norm: string }).q_norm?.trim();
      if (!n) continue;
      byNormInternalBaseline.set(n, (byNormInternalBaseline.get(n) ?? 0) + 1);
    }

    function aggregateGsc(rows: Array<{ keys?: string[]; impressions?: number; clicks?: number }>): Map<string, { impressions: number; clicks: number }> {
      const by = new Map<string, { impressions: number; clicks: number }>();
      for (const row of rows) {
        const keys = row.keys ?? [];
        const query = keys.length >= 1 ? String(keys[0] ?? "").trim() : "";
        if (!query) continue;
        const qNorm = normalizeQuery(query);
        if (!qNorm) continue;
        const imp = Number(row.impressions) || 0;
        const clk = Number(row.clicks) || 0;
        const prev = by.get(qNorm) ?? { impressions: 0, clicks: 0 };
        by.set(qNorm, { impressions: prev.impressions + imp, clicks: prev.clicks + clk });
      }
      return by;
    }

    const latestGscRows = Array.isArray(latestGsc?.result?.rows) ? latestGsc.result.rows : [];
    const baselineGscRows = Array.isArray(baselineGsc?.result?.rows) ? baselineGsc.result.rows : [];
    const byQueryLatest = aggregateGsc(latestGscRows);
    const byQueryBaseline = aggregateGsc(baselineGscRows);

    const lpSlugSet = new Set((existingLps.data ?? []).map((r: { slug: string }) => r.slug));
    const existingStatusByKey = new Map((existingItems.data ?? []).map((r: { key: string; status: string }) => [r.key, r.status]));
    const countyNameMap = getCountyNameMap();

    const allNorms = new Set<string>();
    byQueryLatest.forEach((_, k) => allNorms.add(k));
    byQueryBaseline.forEach((_, k) => allNorms.add(k));
    byNormInternalRecent.forEach((_, k) => allNorms.add(k));
    byNormInternalBaseline.forEach((_, k) => allNorms.add(k));

    const candidates: Array<{
      key: string;
      q_norm: string;
      intent: string;
      county_slug: string | null;
      category_slug: string | null;
      spike_score: number;
      source_mix: Record<string, unknown>;
      recommended_actions: string[];
    }> = [];

    for (const qNorm of allNorms) {
      const latestImp = byQueryLatest.get(qNorm)?.impressions ?? 0;
      const baselineImp = byQueryBaseline.get(qNorm)?.impressions ?? 0;
      const recentInternal = byNormInternalRecent.get(qNorm) ?? 0;
      const baselineInternal = byNormInternalBaseline.get(qNorm) ?? 0;
      const gscGrowth = baselineImp >= minBaseline ? latestImp / baselineImp : 0;
      const internalGrowth = baselineInternal >= minBaseline ? (recentInternal > 0 ? recentInternal / baselineInternal : 0) : recentInternal > 0 ? 1 : 0;
      const spikeScore = Math.max(gscGrowth, internalGrowth);
      if (spikeScore < spikeMultiplier) continue;

      const countySlug = detectCountySlug(qNorm);
      const categorySlug = mapQueryToCategorySlug(qNorm);
      const intent = classifyIntent(qNorm, categorySlug);
      const potentialSlug = slugFromQueryNorm(qNorm);
      const hasLp = lpSlugSet.has(potentialSlug);

      let inventory = 0;
      if (categorySlug || countySlug) {
        const countyName = countySlug ? (countyNameMap.get(countySlug) ?? countySlug) : undefined;
        const query = { categorie: categorySlug ?? undefined, county: countyName ?? countySlug ?? undefined };
        inventory = await countProducts(query, undefined);
      }

      const actions: string[] = [];
      if (categorySlug && countySlug && !hasLp && inventory >= 3) actions.push("create_lp");
      if (categorySlug || hasLp) actions.push("seed_links");
      if (categorySlug) actions.push("hub");
      if (intent === "informational") actions.push("content");
      if (actions.length === 0) actions.push("hub");

      const sourceMix: Record<string, unknown> = {};
      if (latestImp > 0) sourceMix.gsc_latest_impressions = latestImp;
      if (baselineImp > 0) sourceMix.gsc_baseline_impressions = baselineImp;
      if (recentInternal > 0) sourceMix.internal_recent = recentInternal;
      if (baselineInternal > 0) sourceMix.internal_baseline = baselineInternal;

      candidates.push({
        key: qNorm,
        q_norm: qNorm,
        intent,
        county_slug: countySlug,
        category_slug: categorySlug,
        spike_score: Math.round(spikeScore * 100) / 100,
        source_mix: sourceMix,
        recommended_actions: actions,
      });
    }

    const sorted = candidates.sort((a, b) => b.spike_score - a.spike_score).slice(0, maxItems);

    for (const c of sorted) {
      const existingStatus = existingStatusByKey.get(c.key);
      const status = existingStatus ?? "new";
      await supabase.from("growth_trend_items").upsert(
        {
          key: c.key,
          q_norm: c.q_norm,
          intent: c.intent,
          county_slug: c.county_slug,
          category_slug: c.category_slug,
          spike_score: c.spike_score,
          source_mix: c.source_mix,
          recommended_actions: c.recommended_actions,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    }

    await supabase.from("growth_trend_snapshots").insert({
      kind: "detected_7d",
      result: { items: sorted, generatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "market_trends_refresh",
      meta: { correlationId, itemsCount: sorted.length },
    });
    return { ok: true, meta: { itemsCount: sorted.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "market_trends_refresh_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleMarketTrendsApply(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const createLpLimit = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.trends_apply_create_lp_limit, DEFAULT_CREATE_LP_LIMIT);
    const seedLinksLimit = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.trends_apply_seed_links_limit, DEFAULT_SEED_LINKS_LIMIT);

    const { data: items } = await supabase
      .from("growth_trend_items")
      .select("id, key, q_norm, category_slug, county_slug, recommended_actions")
      .in("status", ["new", "accepted"])
      .order("spike_score", { ascending: false });

    const countyNameMap = getCountyNameMap();
    const { data: existingLps } = await supabase.from("seo_landing_pages").select("slug");
    const lpSet = new Set((existingLps ?? []).map((r: { slug: string }) => r.slug));

    let lpsCreated = 0;
    let linksSeeded = 0;
    const hubLinks: Array<{ url: string; title: string }> = [];

    for (const item of items ?? []) {
      const actions = (item.recommended_actions ?? []) as string[];
      const slug = slugFromQueryNorm(item.q_norm as string);
      const categorySlug = (item.category_slug as string) ?? "";
      const countySlug = (item.county_slug as string) ?? "";
      const countyName = countyNameMap.get(countySlug) ?? countySlug;

      if (actions.includes("create_lp") && lpsCreated < createLpLimit && !lpSet.has(slug)) {
        const filters: Record<string, unknown> = { categorie: categorySlug };
        if (countySlug) {
          (filters as Record<string, string>).judet = countySlug;
          (filters as Record<string, string>).county = countyName;
        }
        const title = (item.q_norm as string).replace(/-/g, " ").slice(0, 200);
        await supabase.from("seo_landing_pages").insert({
          slug,
          status: "draft",
          index_stage: "staged",
          noindex: true,
          title,
          h1: title,
          filters_json: filters,
          intro_md: null,
          faq_json: [],
        });
        lpSet.add(slug);
        lpsCreated++;
        hubLinks.push({ url: `${LP_PREFIX}${slug}`, title });
      }

      if (actions.includes("seed_links") && linksSeeded < seedLinksLimit) {
        const targetPath = normalizePath(`${LP_PREFIX}${slug}`);
        const { data: existing } = await supabase.from("seo_internal_links").select("id").eq("source_url", "/ro").eq("target_url", targetPath).limit(1).maybeSingle();
        if (!existing) {
          await supabase.from("seo_internal_links").insert({
            source_url: "/ro",
            target_url: targetPath,
            anchor: (item.q_norm as string).replace(/-/g, " ").slice(0, 60),
            status: "draft",
          });
          linksSeeded++;
        }
      }

      if (actions.includes("content")) {
        await supabase.from("growth_content_items").insert({
          type: "guide",
          status: "draft",
          title: (item.q_norm as string).replace(/-/g, " ").slice(0, 200),
          slug: slug,
          brief: {},
          draft_md: null,
          meta_json: {},
        });
      }

      await supabase.from("growth_trend_items").update({ status: "applied", target_slug: slug }).eq("id", item.id);
    }

    const yyyyMm = new Date().toISOString().slice(0, 7);
    const hubSlug = `trenduri-${yyyyMm}`;
    if (hubLinks.length > 0) {
      await supabase.from("seo_hub_pages").upsert({
        slug: hubSlug,
        status: "published",
        title: `Trenduri ${yyyyMm}`,
        meta: `Pagini trend licitații ${yyyyMm}.`,
        h1: `Trenduri ${yyyyMm}`,
        intro_md: null,
        links_json: hubLinks.slice(0, 50),
        noindex: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "slug" });
    }

    await supabase.from("growth_events").insert({
      type: "market_trends_apply",
      meta: { correlationId, lpsCreated, linksSeeded, itemsApplied: (items ?? []).length },
    });
    return { ok: true, meta: { lpsCreated, linksSeeded, itemsApplied: (items ?? []).length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "market_trends_apply_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
