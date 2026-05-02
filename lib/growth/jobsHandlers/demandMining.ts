import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeQuery } from "@/lib/growth/demand/normalize";
import { detectCountySlug } from "@/lib/growth/demand/geo";
import { mapQueryToCategorySlug } from "@/lib/growth/demand/taxonomyMap";
import { computeDemandScore } from "@/lib/growth/demand/rank";

const CAP_INTERNAL = 2000;
const CAP_GSC = 2000;
const CAP_SUGGESTIONS = 2000;
const CAP_OPPORTUNITIES = 500;
const CAP_CREATE_CANDIDATES = 30;
const LP_PREFIX = "/ro/lp/";

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

function getRecommendedAction(
  categorySlug: string | null,
  countySlug: string | null,
  hasExistingLp: boolean
): string {
  if (categorySlug && countySlug && !hasExistingLp) return "create_lp";
  if (categorySlug) return "improve_content";
  return "add_keyword";
}

export async function handleDemandMiningRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

    const [internalRes, gscSnap, suggestionsRes, existingLpSlugs] = await Promise.all([
      supabase.from("search_queries").select("q_norm").gte("created_at", sevenDaysAgo).limit(50000),
      supabase.from("growth_google_snapshots").select("result").eq("product", "search_console").eq("kind", "performance_overview").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("search_suggestions").select("phrase_norm, popularity").limit(CAP_SUGGESTIONS * 2),
      supabase.from("seo_landing_pages").select("slug"),
    ]);

    const byNormInternal = new Map<string, number>();
    for (const row of internalRes.data ?? []) {
      const n = (row as { q_norm: string }).q_norm?.trim();
      if (!n) continue;
      byNormInternal.set(n, (byNormInternal.get(n) ?? 0) + 1);
    }
    const internalTop = Array.from(byNormInternal.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, CAP_INTERNAL);

    const gscResult = gscSnap.data?.result as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number }> } | null;
    const gscRows = Array.isArray(gscResult?.rows) ? gscResult.rows : [];
    const byQueryGsc = new Map<string, { impressions: number; clicks: number }>();
    for (const row of gscRows) {
      const keys = row.keys ?? [];
      const query = keys.length >= 1 ? String(keys[0] ?? "").trim() : "";
      if (!query) continue;
      const qNorm = normalizeQuery(query);
      if (!qNorm) continue;
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const prev = byQueryGsc.get(qNorm) ?? { impressions: 0, clicks: 0 };
      byQueryGsc.set(qNorm, {
        impressions: prev.impressions + imp,
        clicks: prev.clicks + clk,
      });
    }
    const gscTop = Array.from(byQueryGsc.entries())
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, CAP_GSC);

    const byNormSuggest = new Map<string, number>();
    for (const row of suggestionsRes.data ?? []) {
      const r = row as { phrase_norm?: string; popularity?: number };
      const n = normalizeQuery(r.phrase_norm ?? "");
      if (!n) continue;
      const pop = Number(r.popularity) || 1;
      byNormSuggest.set(n, (byNormSuggest.get(n) ?? 0) + pop);
    }
    const suggestTop = Array.from(byNormSuggest.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, CAP_SUGGESTIONS);

    const allNorms = new Set<string>();
    internalTop.forEach(([n]) => allNorms.add(n));
    gscTop.forEach(([n]) => allNorms.add(n));
    suggestTop.forEach(([n]) => allNorms.add(n));

    const lpSlugSet = new Set((existingLpSlugs.data ?? []).map((r: { slug: string }) => r.slug));

    const opportunities: Array<{
      q_norm: string;
      examples: string[];
      intent: string;
      county_slug: string | null;
      category_slug: string | null;
      demand_score: number;
      source_mix: Record<string, unknown>;
      recommended_action: string;
      target_slug: string | null;
    }> = [];

    for (const qNorm of allNorms) {
      const internalCount = byNormInternal.get(qNorm) ?? 0;
      const gsc = byQueryGsc.get(qNorm) ?? { impressions: 0, clicks: 0 };
      const suggestionPopularity = byNormSuggest.get(qNorm) ?? 0;
      const score = computeDemandScore({
        internalCount,
        gscImpressions: gsc.impressions,
        gscClicks: gsc.clicks,
        suggestionPopularity,
      });
      const countySlug = detectCountySlug(qNorm);
      const categorySlug = mapQueryToCategorySlug(qNorm);
      const potentialSlug = slugFromQueryNorm(qNorm);
      const hasExistingLp = lpSlugSet.has(potentialSlug);
      const recommendedAction = getRecommendedAction(categorySlug, countySlug, hasExistingLp);
      const intent = classifyIntent(qNorm, categorySlug);
      const examples = [qNorm].slice(0, 3);
      const sourceMix: Record<string, unknown> = {};
      if (internalCount > 0) sourceMix.internal = internalCount;
      if (gsc.impressions > 0) sourceMix.gsc_impressions = gsc.impressions;
      if (gsc.clicks > 0) sourceMix.gsc_clicks = gsc.clicks;
      if (suggestionPopularity > 0) sourceMix.suggestions = suggestionPopularity;

      opportunities.push({
        q_norm: qNorm,
        examples,
        intent,
        county_slug: countySlug,
        category_slug: categorySlug,
        demand_score: score,
        source_mix: sourceMix,
        recommended_action: recommendedAction,
        target_slug: potentialSlug,
      });
    }

    const sorted = opportunities
      .filter((o) => o.demand_score > 0)
      .sort((a, b) => b.demand_score - a.demand_score)
      .slice(0, CAP_OPPORTUNITIES);

    const existingQNorm = new Set(
      (await supabase.from("growth_demand_opportunities").select("q_norm").then((r) => r.data ?? [])).map((x: { q_norm: string }) => x.q_norm)
    );
    for (const o of sorted) {
      const row = {
        q_norm: o.q_norm,
        examples: o.examples,
        intent: o.intent,
        county_slug: o.county_slug,
        category_slug: o.category_slug,
        demand_score: o.demand_score,
        source_mix: o.source_mix,
        recommended_action: o.recommended_action,
        target_slug: o.target_slug,
        updated_at: new Date().toISOString(),
      };
      if (existingQNorm.has(o.q_norm)) {
        await supabase.from("growth_demand_opportunities").update(row).eq("q_norm", o.q_norm);
      } else {
        await supabase.from("growth_demand_opportunities").insert({ ...row, status: "new" });
        existingQNorm.add(o.q_norm);
      }
    }

    const snapshotResult = {
      opportunities: sorted,
      generatedAt: new Date().toISOString(),
      totalProcessed: opportunities.length,
    };
    await supabase.from("growth_demand_snapshots").insert({
      kind: "merged_ranked",
      scope_ref: "default",
      result: snapshotResult as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "demand_mining_refresh",
      meta: { correlationId, upserted: sorted.length },
    });
    return { ok: true, meta: { upserted: sorted.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "demand_mining_refresh_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleDemandMiningCreateCandidates(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: opportunities } = await supabase
      .from("growth_demand_opportunities")
      .select("id, q_norm, category_slug, county_slug, demand_score")
      .in("status", ["new", "accepted"])
      .eq("recommended_action", "create_lp")
      .order("demand_score", { ascending: false })
      .limit(CAP_CREATE_CANDIDATES);

    const { data: existingLps } = await supabase.from("seo_landing_pages").select("slug");
    const existingSet = new Set((existingLps ?? []).map((r: { slug: string }) => r.slug));

    let created = 0;
    const countyNameMap = (() => {
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
    })();

    for (const o of opportunities ?? []) {
      const slug = slugFromQueryNorm(o.q_norm as string);
      if (existingSet.has(slug)) {
        await supabase.from("growth_demand_opportunities").update({ status: "done" }).eq("id", o.id);
        continue;
      }
      const categorySlug = (o.category_slug as string) ?? "";
      const countySlug = (o.county_slug as string) ?? "";
      const countyName = countyNameMap.get(countySlug) ?? countySlug;
      const filters: Record<string, unknown> = { categorie: categorySlug };
      if (countySlug) {
        (filters as Record<string, string>).judet = countySlug;
        (filters as Record<string, string>).county = countyName;
      }
      const title = (o.q_norm as string).replace(/-/g, " ");
      await supabase.from("seo_landing_pages").insert({
        slug,
        status: "draft",
        index_stage: "staged",
        noindex: true,
        title: title.slice(0, 200),
        h1: title.slice(0, 200),
        filters_json: filters,
        intro_md: null,
        faq_json: [],
      });
      existingSet.add(slug);
      await supabase.from("growth_demand_opportunities").update({ status: "done", target_slug: slug }).eq("id", o.id);
      created++;
    }

    await supabase.from("growth_events").insert({
      type: "demand_mining_create_candidates",
      meta: { correlationId, created },
    });
    return { ok: true, meta: { created } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "demand_mining_create_candidates_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
