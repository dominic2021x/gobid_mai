import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting, getGrowthSettingNumber, GROWTH_SETTING_KEYS } from "@/lib/growth/settings";
import { normalizePath } from "@/lib/urls/normalizePath";
import { chatCompletion } from "@/lib/growth/llm";

const MAX_NEW_PER_RUN = 100;
const LP_PREFIX = "/ro/lp/";
const SEED_STAGED_LIMIT = 20;
const SEED_MAX_PER_SOURCE = 2;
const SEED_MAX_LINKS_PER_RUN = 40;
const DEMOTION_MIN_CLICKS = 1;
const DEMOTION_MIN_IMPRESSIONS = 20;
const DEMOTION_CTR_THRESHOLD = 0.003;
const ENRICH_IMPRESSIONS_MIN = 30;
const ENRICH_PAGES_PER_RUN = 10;

function slugFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

function filtersFromMappedUrl(mappedUrl: string): Record<string, unknown> {
  const path = normalizePath(mappedUrl);
  const segment = path.split("/").filter(Boolean).pop();
  if (segment && segment !== "ro") return { categorie: segment };
  return {};
}

export async function handlePseoGenerateCandidates(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: snap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "keywords")
      .eq("kind", "clusters")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const result = snap?.result as { clusters?: Array<{ label?: string; mappedUrl?: string }> } | null;
    const clusters = Array.isArray(result?.clusters) ? result.clusters : [];

    const { data: existing } = await supabase
      .from("seo_landing_pages")
      .select("slug");
    const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

    const toInsert: Array<{
      slug: string;
      status: string;
      index_stage: string;
      noindex: boolean;
      title: string | null;
      h1: string | null;
      filters_json: Record<string, unknown>;
      intro_md: string | null;
      faq_json: unknown[];
    }> = [];
    for (const cluster of clusters) {
      const label = typeof cluster.label === "string" ? cluster.label.trim() : "";
      if (!label) continue;
      const slug = slugFromLabel(label);
      if (existingSlugs.has(slug)) continue;
      toInsert.push({
        slug,
        status: "draft",
        index_stage: "staged",
        noindex: true,
        title: label,
        h1: label,
        filters_json: filtersFromMappedUrl(String(cluster.mappedUrl ?? "")),
        intro_md: null,
        faq_json: [],
      });
      existingSlugs.add(slug);
      if (toInsert.length >= MAX_NEW_PER_RUN) break;
    }

    if (toInsert.length === 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_generate_candidates",
        meta: { correlationId, inserted: 0, reason: "no_new_candidates" },
      });
      return { ok: true, meta: { inserted: 0 } };
    }

    const { error } = await supabase.from("seo_landing_pages").insert(toInsert);
    if (error) throw error;
    await supabase.from("growth_events").insert({
      type: "pseo_generate_candidates",
      meta: { correlationId, inserted: toInsert.length, slugs: toInsert.map((r) => r.slug) },
    });
    return { ok: true, meta: { inserted: toInsert.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_generate_candidates_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handlePseoScoreAndPromote(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const minImpressions = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.pseo_min_impressions_28d, 50);
    const minClicks = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.pseo_min_clicks_28d, 2);
    const minCtr = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.pseo_min_ctr, 0.01);
    const maxIndexablePages = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.pseo_max_indexable_pages, 500);

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

    const siteUrl = await getGrowthSetting("gsc_site_url");
    const baseUrl = (siteUrl ?? "https://gobid.ro").trim().replace(/\/$/, "");
    const byPagePath = new Map<string, { impressions: number; clicks: number; ctr: number }>();
    for (const row of gscRows) {
      const keys = row.keys ?? [];
      if (keys.length < 2) continue;
      const pageRaw = keys[1];
      const path = normalizePath(String(pageRaw ?? ""));
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const ctrVal = typeof row.ctr === "number" ? row.ctr : (imp > 0 ? clk / imp : 0);
      const prev = byPagePath.get(path) ?? { impressions: 0, clicks: 0, ctr: 0 };
      byPagePath.set(path, {
        impressions: prev.impressions + imp,
        clicks: prev.clicks + clk,
        ctr: prev.ctr,
      });
    }
    for (const [path, agg] of byPagePath) {
      if (agg.impressions > 0) {
        agg.ctr = agg.clicks / agg.impressions;
      }
    }

    const { data: stagedRows, error: fetchErr } = await supabase
      .from("seo_landing_pages")
      .select("slug, index_stage")
      .eq("index_stage", "staged");
    if (fetchErr) throw fetchErr;

    const { count: indexableCount, error: countErr } = await supabase
      .from("seo_landing_pages")
      .select("slug", { count: "exact", head: true })
      .eq("index_stage", "indexable");
    if (countErr) throw countErr;
    let indexableNow = indexableCount ?? 0;
    const maxIndexable = maxIndexablePages;

    const now = new Date().toISOString();
    let promoted = 0;
    for (const row of stagedRows ?? []) {
      const slug = row.slug as string;
      const lpPath = normalizePath(`${LP_PREFIX}${slug}`);
      const fullUrlPath = normalizePath(`${baseUrl}${LP_PREFIX}${slug}`);
      const gsc = byPagePath.get(lpPath) ?? byPagePath.get(fullUrlPath) ?? byPagePath.get(`/ro/lp/${slug}`);
      const impressions = gsc?.impressions ?? 0;
      const clicks = gsc?.clicks ?? 0;
      const ctr = gsc?.ctr ?? 0;

      await supabase
        .from("seo_landing_pages")
        .update({
          gsc_impressions_28d: impressions,
          gsc_clicks_28d: clicks,
          last_scored_at: now,
        })
        .eq("slug", slug);

      const canPromote = indexableNow < maxIndexable;
      if (
        canPromote &&
        impressions >= minImpressions &&
        clicks >= minClicks &&
        ctr >= minCtr
      ) {
        await supabase
          .from("seo_landing_pages")
          .update({
            noindex: false,
            index_stage: "indexable",
            status: "published",
          })
          .eq("slug", slug);
        promoted++;
        indexableNow++;
      }
    }

    if (promoted > 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_page_promoted",
        meta: { correlationId, promoted, stagedScored: (stagedRows ?? []).length },
      });
    }
    await supabase.from("growth_events").insert({
      type: "pseo_score_and_promote",
      meta: { correlationId, stagedScored: (stagedRows ?? []).length, promoted },
    });
    return { ok: true, meta: { stagedScored: (stagedRows ?? []).length, promoted } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_score_and_promote_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handlePseoSeedInternalLinks(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: staged } = await supabase
      .from("seo_landing_pages")
      .select("slug, title, h1")
      .eq("index_stage", "staged")
      .eq("noindex", true)
      .limit(SEED_STAGED_LIMIT)
      .order("gsc_impressions_28d", { ascending: false });
    const targets = (staged ?? []) as Array<{ slug: string; title: string | null; h1: string | null }>;

    const hubSources: string[] = [normalizePath("/ro")];
    const { data: indexableLps } = await supabase
      .from("seo_landing_pages")
      .select("slug")
      .eq("index_stage", "indexable")
      .limit(10)
      .order("gsc_impressions_28d", { ascending: false });
    for (const row of indexableLps ?? []) {
      const slug = (row as { slug: string }).slug;
      if (slug) hubSources.push(normalizePath(`${LP_PREFIX}${slug}`));
    }

    const bySource = new Map<string, number>();
    const toInsert: Array<{ source_url: string; target_url: string; anchor: string; status: string }> = [];
    for (const t of targets) {
      const targetPath = normalizePath(`${LP_PREFIX}${t.slug}`);
      const anchor = (t.title ?? t.h1 ?? t.slug).trim().slice(0, 60) || "Află mai multe";
      for (const source of hubSources) {
        if (source === targetPath) continue;
        const count = bySource.get(source) ?? 0;
        if (count >= SEED_MAX_PER_SOURCE) continue;
        if (toInsert.length >= SEED_MAX_LINKS_PER_RUN) break;
        toInsert.push({ source_url: source, target_url: targetPath, anchor, status: "draft" });
        bySource.set(source, count + 1);
      }
      if (toInsert.length >= SEED_MAX_LINKS_PER_RUN) break;
    }

    if (toInsert.length === 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_seed_internal_links",
        meta: { correlationId, inserted: 0, reason: "no_candidates" },
      });
      return { ok: true, meta: { inserted: 0 } };
    }

    const { error } = await supabase.from("seo_internal_links").insert(toInsert);
    if (error) throw error;
    await supabase.from("growth_events").insert({
      type: "pseo_seed_internal_links",
      meta: { correlationId, inserted: toInsert.length },
    });
    return { ok: true, meta: { inserted: toInsert.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_seed_internal_links_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handlePseoDemotion(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: indexable } = await supabase
      .from("seo_landing_pages")
      .select("slug, gsc_clicks_28d, gsc_impressions_28d")
      .eq("index_stage", "indexable")
      .eq("noindex", false);
    const rows = (indexable ?? []) as Array<{ slug: string; gsc_clicks_28d: number; gsc_impressions_28d: number }>;
    let demoted = 0;
    for (const r of rows) {
      const clicks = r.gsc_clicks_28d ?? 0;
      const impressions = r.gsc_impressions_28d ?? 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const shouldDemote =
        (clicks < DEMOTION_MIN_CLICKS && impressions < DEMOTION_MIN_IMPRESSIONS) ||
        ctr < DEMOTION_CTR_THRESHOLD;
      if (shouldDemote) {
        await supabase
          .from("seo_landing_pages")
          .update({ noindex: true, index_stage: "staged" })
          .eq("slug", r.slug);
        demoted++;
      }
    }
    if (demoted > 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_page_demoted",
        meta: { correlationId, demoted },
      });
    }
    await supabase.from("growth_events").insert({
      type: "pseo_demotion",
      meta: { correlationId, demoted, checked: rows.length },
    });
    return { ok: true, meta: { demoted, checked: rows.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_demotion_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handlePseoEnrichContent(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: candidates } = await supabase
      .from("seo_landing_pages")
      .select("slug, title, h1, intro_md")
      .eq("index_stage", "staged")
      .gte("gsc_impressions_28d", ENRICH_IMPRESSIONS_MIN)
      .limit(ENRICH_PAGES_PER_RUN * 2);
    const rawRows = (candidates ?? []) as Array<{ slug: string; title: string | null; h1: string | null; intro_md: string | null }>;
    const rows = rawRows.filter((r) => !r.intro_md || r.intro_md.trim() === "").slice(0, ENRICH_PAGES_PER_RUN);

    let enriched = 0;
    for (const r of rows) {
      const title = (r.title ?? r.h1 ?? r.slug).trim();
      const prompt = `Scrie un scurt paragraf introductiv (120-200 cuvinte) și 3 întrebări frecvente cu răspunsuri scurte pentru o pagină de tip landing pe un site de licitații/marketplace din România. Tema paginii: ${title}. Răspunde DOAR cu un JSON valid: {"intro_md":"...","faqs":[{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}]}. Limba: română. Conținut safe, fără promisiuni exagerate.`;
      try {
        const raw = await chatCompletion(
          [{ role: "user", content: prompt }],
          { temperature: 0.3, max_tokens: 800 }
        );
        const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
        const parsed = JSON.parse(cleaned) as { intro_md?: string; faqs?: Array<{ question?: string; answer?: string }> };
        const introMd = typeof parsed.intro_md === "string" ? parsed.intro_md.trim().slice(0, 2000) : "";
        const faqs = Array.isArray(parsed.faqs)
          ? parsed.faqs
            .slice(0, 3)
            .map((f) => ({ question: String(f?.question ?? "").slice(0, 200), answer: String(f?.answer ?? "").slice(0, 500) }))
            .filter((f) => f.question || f.answer)
          : [];
        if (introMd || faqs.length > 0) {
          await supabase
            .from("seo_landing_pages")
            .update({ intro_md: introMd || null, faq_json: faqs })
            .eq("slug", r.slug);
          enriched++;
        }
      } catch {
        // skip this page
      }
    }

    await supabase.from("growth_events").insert({
      type: "pseo_enrich_content",
      meta: { correlationId, enriched, processed: rows.length },
    });
    return { ok: true, meta: { enriched, processed: rows.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_enrich_content_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
