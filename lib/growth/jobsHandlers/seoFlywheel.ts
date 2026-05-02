import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting, getGrowthSettingNumber, GROWTH_SETTING_KEYS } from "@/lib/growth/settings";
import { normalizePath } from "@/lib/urls/normalizePath";

const LP_PREFIX = "/ro/lp/";
const HUB_PREFIX = "/ro/hub/";
const MAX_RANKED_OPPORTUNITIES = 200;
const MAX_CTR_EXPERIMENTS_NEW = 5;
const MAX_HUBS = 20;
const DEFAULT_CTR_TEST_DAYS = 14;
const DEFAULT_CTR_THRESHOLD = 0.03;
const DEFAULT_MIN_IMPRESSIONS_CTR = 100;
const DEFAULT_PRUNE_DAYS = 60;
const DEFAULT_MAX_DEMOTION_STRIKES = 3;
const PRUNE_STAGED_MIN_IMPRESSIONS = 10;
const MS_PER_DAY = 86400 * 1000;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null) return 0;
  return Number(String(v).replace(/\D/g, "")) || 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export async function handleSeoFlywheelRankOpportunities(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const scope = (await getGrowthSetting("gsc_site_url"))?.trim() ?? "default";
    const [
      gscSnap,
      seoOppSnap,
      kwSnap,
      lpRows,
    ] = await Promise.all([
      supabase.from("growth_google_snapshots").select("result").eq("product", "search_console").eq("kind", "performance_overview").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("growth_google_snapshots").select("result").eq("product", "seo").eq("kind", "opportunities").eq("scope_ref", scope).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("growth_google_snapshots").select("result").eq("product", "keywords").eq("kind", "clusters").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("seo_landing_pages").select("slug"),
    ]);

    const gscResult = gscSnap?.data?.result as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number; ctr?: number; position?: number }> } | null;
    const gscRows = Array.isArray(gscResult?.rows) ? gscResult.rows : [];
    const seoOpp = seoOppSnap?.data?.result as { lowCtrPages?: Array<{ page?: string; impressions?: number; ctr?: number; position?: number }>; strikingDistanceQueries?: Array<{ query?: string; page?: string; position?: number }> } | null;
    const lowCtrPages = Array.isArray(seoOpp?.lowCtrPages) ? seoOpp.lowCtrPages : [];
    const strikingQueries = Array.isArray(seoOpp?.strikingDistanceQueries) ? seoOpp.strikingDistanceQueries : [];
    const clusters = (kwSnap?.data?.result as { clusters?: unknown[] } | null)?.clusters ?? [];
    const lpSlugs = new Set((lpRows?.data ?? []).map((r: { slug: string }) => r.slug));

    const scoreByKey = new Map<string, { page: string; query?: string; score: number; impressions: number; ctr: number; position: number }>();

    for (const row of gscRows) {
      const keys = row.keys ?? [];
      const page = keys.length >= 2 ? str(keys[1]) : "";
      const query = keys.length >= 1 ? str(keys[0]) : "";
      if (!page) continue;
      const impressions = num(row.impressions);
      const clicks = num(row.clicks);
      const position = Math.max(1, num(row.position));
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const score = impressions * (1 / position) * (ctr < 0.05 ? 1 + (0.05 - ctr) : 1);
      const key = `${page}\t${query}`;
      const prev = scoreByKey.get(key);
      if (!prev || score > prev.score) {
        scoreByKey.set(key, { page, query: query || undefined, score, impressions, ctr, position });
      }
    }

    for (const p of lowCtrPages) {
      const page = str(p.page);
      if (!page) continue;
      const impressions = num(p.impressions);
      const ctr = num(p.ctr);
      const position = Math.max(1, num(p.position));
      const score = impressions * (1 / position) * (1 + Math.max(0, 0.05 - ctr));
      const key = `${page}\t`;
      const prev = scoreByKey.get(key);
      if (!prev || score > prev.score) {
        scoreByKey.set(key, { page, score, impressions, ctr, position });
      }
    }

    const opportunities = Array.from(scoreByKey.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RANKED_OPPORTUNITIES)
      .map(({ page, query, score, impressions, ctr, position }) => ({
        page,
        query: query ?? null,
        score: Math.round(score * 100) / 100,
        impressions,
        ctr,
        position,
      }));

    const result = {
      opportunities,
      generatedAt: new Date().toISOString(),
      lowCtrCount: lowCtrPages.length,
      strikingCount: strikingQueries.length,
      clusterCount: clusters.length,
      lpCount: lpSlugs.size,
    };

    await supabase.from("growth_google_snapshots").insert({
      product: "flywheel",
      kind: "ranked_opportunities",
      scope_ref: scope,
      result: result as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_rank_opportunities",
      meta: { correlationId, opportunityCount: opportunities.length },
    });
    return { ok: true, meta: { opportunityCount: opportunities.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_rank_opportunities_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleSeoFlywheelCtrExperiments(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const testDays = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.flywheel_ctr_test_days, DEFAULT_CTR_TEST_DAYS);
    const ctrThreshold = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.flywheel_ctr_threshold, DEFAULT_CTR_THRESHOLD);
    const minImpressions = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.flywheel_min_impressions_ctr, DEFAULT_MIN_IMPRESSIONS_CTR);
    const baseUrl = (await getGrowthSetting("gsc_site_url"))?.trim()?.replace(/\/$/, "") ?? "https://gobid.ro";

    const { data: gscSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "search_console")
      .eq("kind", "performance_overview")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const gscResult = gscSnap?.result as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number; ctr?: number }> } | null;
    const gscRows = Array.isArray(gscResult?.rows) ? gscResult.rows : [];
    const byPagePath = new Map<string, { impressions: number; clicks: number; ctr: number }>();
    for (const row of gscRows) {
      const keys = row.keys ?? [];
      if (keys.length < 2) continue;
      const path = normalizePath(String(keys[1] ?? ""));
      const imp = num(row.impressions);
      const clk = num(row.clicks);
      const ctrVal = imp > 0 ? clk / imp : 0;
      const prev = byPagePath.get(path) ?? { impressions: 0, clicks: 0, ctr: 0 };
      byPagePath.set(path, { impressions: prev.impressions + imp, clicks: prev.clicks + clk, ctr: prev.ctr });
    }
    for (const [, agg] of byPagePath) {
      if (agg.impressions > 0) agg.ctr = agg.clicks / agg.impressions;
    }

    const { data: experiments } = await supabase
      .from("seo_ctr_experiments")
      .select("id, page_url, variant_a, variant_b, state, started_at, updated_at")
      .in("state", ["queued", "running_a", "running_b"]);
    const now = Date.now();
    const testMs = testDays * MS_PER_DAY;
    let advanced = 0;

    for (const exp of experiments ?? []) {
      const id = exp.id as string;
      const pageUrl = str(exp.page_url);
      const state = str(exp.state);
      const variantA = (exp.variant_a ?? {}) as { title?: string; meta?: string };
      const variantB = (exp.variant_b ?? {}) as { title?: string; meta?: string };
      const startedAt = exp.started_at ? new Date(exp.started_at).getTime() : 0;
      const updatedAt = exp.updated_at ? new Date(exp.updated_at).getTime() : 0;

      if (state === "queued") {
        await supabase.from("seo_ctr_experiments").update({ state: "running_a", started_at: new Date().toISOString() }).eq("id", id);
        await supabase.from("seo_overrides").upsert({
          url: pageUrl,
          title: str(variantA.title) || null,
          meta: str(variantA.meta) || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "url" });
        advanced++;
        await supabase.from("growth_events").insert({
          type: "seo_flywheel_ctr_experiment_start",
          meta: { correlationId, experimentId: id, pageUrl, variant: "A" },
        });
      } else if (state === "running_a" && now - startedAt >= testMs) {
        await supabase.from("seo_ctr_experiments").update({ state: "running_b" }).eq("id", id);
        await supabase.from("seo_overrides").upsert({
          url: pageUrl,
          title: str(variantB.title) || null,
          meta: str(variantB.meta) || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "url" });
        advanced++;
        await supabase.from("growth_events").insert({
          type: "seo_flywheel_ctr_experiment_switch",
          meta: { correlationId, experimentId: id, pageUrl, variant: "B" },
        });
      } else if (state === "running_b" && now - updatedAt >= testMs) {
        const path = normalizePath(pageUrl.replace(baseUrl, "")) || normalizePath(new URL(pageUrl).pathname);
        const gsc = byPagePath.get(path) ?? byPagePath.get(path.startsWith("/") ? path : `/${path}`);
        const ctrA = 0;
        const ctrB = gsc?.ctr ?? 0;
        const winner = ctrB > ctrA ? "B" : "A";
        const winnerVariant = winner === "B" ? variantB : variantA;
        await supabase.from("seo_ctr_experiments").update({ state: "done", winner }).eq("id", id);
        await supabase.from("seo_overrides").upsert({
          url: pageUrl,
          title: str(winnerVariant.title) || null,
          meta: str(winnerVariant.meta) || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "url" });
        advanced++;
        await supabase.from("growth_events").insert({
          type: "seo_flywheel_ctr_experiment_done",
          meta: { correlationId, experimentId: id, pageUrl, winner },
        });
      }
    }

    const { data: indexableLps } = await supabase
      .from("seo_landing_pages")
      .select("slug, title, meta, gsc_impressions_28d")
      .eq("index_stage", "indexable")
      .eq("noindex", false);
    const { data: existingExps } = await supabase.from("seo_ctr_experiments").select("page_url").in("state", ["queued", "running_a", "running_b"]);
    const existingUrls = new Set((existingExps ?? []).map((e: { page_url: string }) => str(e.page_url)));
    let created = 0;
    for (const lp of indexableLps ?? []) {
      if (created >= MAX_CTR_EXPERIMENTS_NEW) break;
      const slug = str(lp.slug);
      const impressions = num(lp.gsc_impressions_28d);
      const path = normalizePath(`${LP_PREFIX}${slug}`);
      const gsc = byPagePath.get(path);
      const ctr = gsc?.ctr ?? (impressions > 0 ? 0 : 0);
      if (impressions < minImpressions || ctr >= ctrThreshold) continue;
      const pageUrl = `${baseUrl}${LP_PREFIX}${slug}`;
      if (existingUrls.has(pageUrl)) continue;
      const title = str(lp.title) || slug;
      const meta = str(lp.meta) || "";
      await supabase.from("seo_ctr_experiments").insert({
        page_url: pageUrl,
        variant_a: { title, meta },
        variant_b: { title: `${title} | Licitații`, meta: meta || `Licitații ${title}.` },
        state: "queued",
      });
      existingUrls.add(pageUrl);
      created++;
    }

    const { data: allExps } = await supabase.from("seo_ctr_experiments").select("id, page_url, state, winner");
    const status = {
      experiments: (allExps ?? []).length,
      queued: (allExps ?? []).filter((e: { state: string }) => e.state === "queued").length,
      running_a: (allExps ?? []).filter((e: { state: string }) => e.state === "running_a").length,
      running_b: (allExps ?? []).filter((e: { state: string }) => e.state === "running_b").length,
      done: (allExps ?? []).filter((e: { state: string }) => e.state === "done").length,
      generatedAt: new Date().toISOString(),
    };
    await supabase.from("growth_google_snapshots").insert({
      product: "flywheel",
      kind: "ctr_experiments_status",
      scope_ref: "default",
      result: status as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_ctr_experiments",
      meta: { correlationId, advanced, created },
    });
    return { ok: true, meta: { advanced, created } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_ctr_experiments_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleSeoFlywheelHubsGenerate(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: lps } = await supabase
      .from("seo_landing_pages")
      .select("slug, title, gsc_impressions_28d")
      .in("status", ["published", "review"])
      .eq("noindex", false)
      .order("gsc_impressions_28d", { ascending: false })
      .limit(300);
    const rows = (lps ?? []) as Array<{ slug: string; title: string | null; gsc_impressions_28d: number }>;
    const byCategory = new Map<string, Array<{ slug: string; title: string; impressions: number }>>();
    for (const r of rows) {
      const slug = str(r.slug);
      const parts = slug.split("-");
      const category = parts.length >= 2 ? parts[0] : "geo";
      const list = byCategory.get(category) ?? [];
      if (list.length >= 15) continue;
      list.push({ slug, title: str(r.title) || slug, impressions: num(r.gsc_impressions_28d) });
      byCategory.set(category, list);
    }

    const categories = Array.from(byCategory.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, MAX_HUBS);
    let upserted = 0;
    for (const [cat, links] of categories) {
      const hubSlug = `hub-${cat}`;
      const linksJson = links.map((l) => ({ url: `${LP_PREFIX}${l.slug}`, title: l.title }));
      const title = `Licitații ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
      const { error } = await supabase.from("seo_hub_pages").upsert({
        slug: hubSlug,
        status: "published",
        title,
        meta: `Listă pagini licitații ${cat}.`,
        h1: title,
        intro_md: null,
        links_json: linksJson,
        noindex: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "slug" });
      if (!error) upserted++;
    }

    for (const [cat] of categories) {
      const hubSlug = `hub-${cat}`;
      const targetPath = normalizePath(`${HUB_PREFIX}${hubSlug}`);
      const { data: existing } = await supabase.from("seo_internal_links").select("id").eq("source_url", "/ro").eq("target_url", targetPath).limit(1).maybeSingle();
      if (!existing) {
        await supabase.from("seo_internal_links").insert({
          source_url: "/ro",
          target_url: targetPath,
          anchor: `Licitații ${cat}`,
          status: "draft",
        });
      }
    }

    await supabase.from("growth_events").insert({
      type: "seo_flywheel_hubs_generate",
      meta: { correlationId, upserted, hubCount: categories.length },
    });
    return { ok: true, meta: { upserted, hubCount: categories.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_hubs_generate_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleSeoFlywheelWeeklyPrune(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const pruneDays = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.flywheel_prune_days, DEFAULT_PRUNE_DAYS);
    const maxStrikes = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.flywheel_max_demotion_strikes, DEFAULT_MAX_DEMOTION_STRIKES);
    const cutoff = new Date(Date.now() - pruneDays * MS_PER_DAY).toISOString();
    let archivedStaged = 0;
    let demoted = 0;
    let locked = 0;

    const { data: staged } = await supabase
      .from("seo_landing_pages")
      .select("slug, created_at, gsc_impressions_28d, meta_json")
      .eq("index_stage", "staged")
      .lt("created_at", cutoff);
    for (const row of staged ?? []) {
      const impressions = num(row.gsc_impressions_28d);
      if (impressions >= PRUNE_STAGED_MIN_IMPRESSIONS) continue;
      await supabase.from("seo_landing_pages").update({ status: "archived" }).eq("slug", row.slug);
      archivedStaged++;
    }

    const { data: indexable } = await supabase
      .from("seo_landing_pages")
      .select("slug, meta_json, filters_json")
      .eq("index_stage", "indexable")
      .eq("noindex", false);
    const { countProducts } = await import("@/lib/server/products/listingsCountRepo");
    for (const row of indexable ?? []) {
      const slug = str(row.slug);
      const meta = (row.meta_json ?? {}) as { demotionStrikes?: number };
      const strikes = Math.max(0, num(meta.demotionStrikes));
      const filters = (row.filters_json ?? {}) as Record<string, unknown>;
      const query = { categorie: str(filters?.categorie), county: str(filters?.county) };
      const inventory = await countProducts(query, undefined);
      if (inventory === 0) {
        await supabase.from("seo_landing_pages").update({
          noindex: true,
          index_stage: "staged",
          meta_json: { ...meta, demotionStrikes: strikes + 1 },
        }).eq("slug", slug);
        demoted++;
        await supabase.from("growth_events").insert({
          type: "pseo_page_demoted",
          meta: { correlationId, slug, reason: "inventory_zero", strikes: strikes + 1 },
        });
        if (strikes + 1 >= maxStrikes) {
          await supabase.from("seo_landing_pages").update({ status: "archived" }).eq("slug", slug);
          locked++;
        }
      }
    }

    await supabase.from("growth_events").insert({
      type: "seo_flywheel_weekly_prune",
      meta: { correlationId, archivedStaged, demoted, locked },
    });
    return { ok: true, meta: { archivedStaged, demoted, locked } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_flywheel_weekly_prune_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
