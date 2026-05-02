import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getGrowthSetting } from "@/lib/growth/settings";
import { evaluateUrl } from "@/lib/growth/rules";
import { chatCompletion } from "@/lib/growth/llm";

const GSC_SITE_KEY = "gsc_site_url";
const MAX_PAGES_INDEXABILITY = 100;
const LOW_CTR_THRESHOLD = 0.02;
const MIN_IMPRESSIONS_LOW_CTR = 10;
const STRIKING_POSITION_MIN = 4;
const STRIKING_POSITION_MAX = 15;
const MIN_IMPRESSIONS_STRIKING = 5;
const TOP_LOW_CTR = 15;
const TOP_STRIKING = 15;
const TOP_TARGETS_LINKS = 3;
const SOURCE_URLS_PER_TARGET = 8;
const FETCH_TIMEOUT_MS = 15000;

const lowCtrPageSchema = z.object({
  page: z.string(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
  suggestedTitle: z.string(),
  suggestedMeta: z.string(),
});

const strikingDistanceSchema = z.object({
  query: z.string(),
  position: z.number(),
  page: z.string(),
  suggestedActions: z.array(z.string()).max(5),
});

const indexabilityIssueSchema = z.object({
  url: z.string(),
  reasons: z.array(z.string()),
});

const opportunitiesSchema = z.object({
  lowCtrPages: z.array(lowCtrPageSchema).max(20),
  strikingDistanceQueries: z.array(strikingDistanceSchema).max(20),
  indexabilityIssues: z.array(indexabilityIssueSchema).max(100),
});

const internalLinkPlanItemSchema = z.object({
  targetUrl: z.string(),
  sourceUrls: z.array(z.string()).max(15),
  suggestedAnchors: z.array(z.string()).max(10),
});

const internalLinkPlanSchema = z.object({
  plans: z.array(internalLinkPlanItemSchema).max(10),
});

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null) return 0;
  return Number(String(v).replace(/\D/g, "")) || 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(sitemapUrl, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const locs = text.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
    return locs
      .map((loc) => loc.replace(/<\/?loc>/gi, "").trim())
      .filter(Boolean)
      .slice(0, MAX_PAGES_INDEXABILITY);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleSeoGrowthRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const siteUrl = await getGrowthSetting(GSC_SITE_KEY);
  if (!siteUrl?.trim()) {
    return { ok: false, error: "gsc_site_url not set in growth_settings" };
  }
  const scope = siteUrl.trim();

  try {
    const { data: snap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "search_console")
      .eq("kind", "performance_overview")
      .eq("scope_ref", scope)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = snap?.result as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> } | null;
    const rows = result?.rows ?? [];

    const pageSet = new Set<string>();
    for (const row of rows) {
      const keys = row.keys ?? [];
      if (keys.length >= 2) pageSet.add(str(keys[1]));
    }
    let urlsToCheck = Array.from(pageSet).slice(0, MAX_PAGES_INDEXABILITY);
    const sitemapUrl = await getGrowthSetting("seo_sitemap_url");
    if (sitemapUrl?.trim()) {
      const sitemapUrls = await fetchSitemapUrls(sitemapUrl.trim());
      for (const u of sitemapUrls) {
        if (urlsToCheck.length >= MAX_PAGES_INDEXABILITY) break;
        if (!pageSet.has(u)) urlsToCheck.push(u);
      }
    }

    const indexabilityIssues: { url: string; reasons: string[] }[] = [];
    for (const url of urlsToCheck) {
      const ev = evaluateUrl(url);
      if (!ev.indexable && ev.reasons.length) {
        indexabilityIssues.push({ url, reasons: ev.reasons });
      }
    }

    const rowsWithPage = rows.filter((r) => (r.keys ?? []).length >= 2) as Array<{
      keys: string[];
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
    const lowCtrRows = rowsWithPage
      .filter((r) => num(r.impressions) >= MIN_IMPRESSIONS_LOW_CTR && num(r.ctr) < LOW_CTR_THRESHOLD)
      .sort((a, b) => num(b.impressions) - num(a.impressions))
      .slice(0, TOP_LOW_CTR);
    const strikingRows = rowsWithPage
      .filter(
        (r) =>
          num(r.impressions) >= MIN_IMPRESSIONS_STRIKING &&
          num(r.position) >= STRIKING_POSITION_MIN &&
          num(r.position) <= STRIKING_POSITION_MAX
      )
      .sort((a, b) => num(a.position) - num(b.position))
      .slice(0, TOP_STRIKING);

    let lowCtrPages: z.infer<typeof lowCtrPageSchema>[] = lowCtrRows.map((r) => ({
      page: str(r.keys[1]),
      impressions: num(r.impressions),
      ctr: num(r.ctr),
      position: num(r.position),
      suggestedTitle: "",
      suggestedMeta: "",
    }));

    if (lowCtrPages.length > 0) {
      const prompt = `For each of these pages with low CTR, suggest a short title (under 60 chars) and meta description (under 160 chars). Return ONLY a JSON array of objects: [{"suggestedTitle":"...","suggestedMeta":"..."}] one per line in same order. No other text.\n${lowCtrPages.map((p) => p.page).join("\n")}`;
      try {
        const raw = await chatCompletion(
          [{ role: "user", content: prompt }],
          { temperature: 0.3, max_tokens: 1500 }
        );
        const cleaned = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
        const parsed = JSON.parse(cleaned) as Array<{ suggestedTitle?: string; suggestedMeta?: string }>;
        parsed.forEach((item, i) => {
          if (lowCtrPages[i]) {
            lowCtrPages[i] = { ...lowCtrPages[i], suggestedTitle: str(item?.suggestedTitle).slice(0, 60), suggestedMeta: str(item?.suggestedMeta).slice(0, 160) };
          }
        });
      } catch {
        // keep empty suggestions
      }
    }

    let strikingDistanceQueries: z.infer<typeof strikingDistanceSchema>[] = strikingRows.map((r) => ({
      query: str(r.keys?.[0]),
      position: num(r.position),
      page: str(r.keys?.[1]),
      suggestedActions: [],
    }));

    if (strikingDistanceQueries.length > 0) {
      const prompt = `For each search query in striking distance (position 4-15), suggest 1-3 concrete actions to improve ranking. Return ONLY a JSON array of objects: [{"suggestedActions":["action1","action2"]}] same order. No other text.\n${strikingDistanceQueries.map((s) => s.query).join("\n")}`;
      try {
        const raw = await chatCompletion(
          [{ role: "user", content: prompt }],
          { temperature: 0.3, max_tokens: 1000 }
        );
        const cleaned = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
        const parsed = JSON.parse(cleaned) as Array<{ suggestedActions?: string[] }>;
        parsed.forEach((item, i) => {
          if (strikingDistanceQueries[i] && Array.isArray(item?.suggestedActions)) {
            strikingDistanceQueries[i].suggestedActions = item.suggestedActions.slice(0, 5).map(str);
          }
        });
      } catch {
        // keep empty
      }
    }

    const byPageImpressions = new Map<string, number>();
    for (const r of rowsWithPage) {
      const page = str(r.keys?.[1]);
      const imp = num(r.impressions);
      byPageImpressions.set(page, (byPageImpressions.get(page) ?? 0) + imp);
    }
    const sortedPages = Array.from(byPageImpressions.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([url]) => url);
    const targetUrls = sortedPages.slice(0, TOP_TARGETS_LINKS);
    const sourcePool = sortedPages.slice(TOP_TARGETS_LINKS, TOP_TARGETS_LINKS + SOURCE_URLS_PER_TARGET * 2);
    const plans: z.infer<typeof internalLinkPlanItemSchema>[] = [];
    for (const targetUrl of targetUrls) {
      const sourceUrls = sourcePool.filter((u) => u !== targetUrl).slice(0, SOURCE_URLS_PER_TARGET);
      let suggestedAnchors: string[] = [];
      if (sourceUrls.length > 0) {
        try {
          const prompt = `Suggest 2-4 anchor text phrases for internal links pointing to this URL. Return ONLY a JSON array of strings: ["anchor1","anchor2"]. Target URL: ${targetUrl}`;
          const raw = await chatCompletion(
            [{ role: "user", content: prompt }],
            { temperature: 0.3, max_tokens: 300 }
          );
          const cleaned = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
          suggestedAnchors = (JSON.parse(cleaned) as string[]).slice(0, 10).map(str).filter(Boolean);
        } catch {
          // keep empty
        }
      }
      plans.push({ targetUrl, sourceUrls, suggestedAnchors });
    }

    const opportunitiesResult = opportunitiesSchema.parse({
      lowCtrPages,
      strikingDistanceQueries,
      indexabilityIssues,
    });
    const linkPlanResult = internalLinkPlanSchema.parse({ plans });

    const generatedAt = new Date().toISOString();
    await supabase.from("growth_google_snapshots").insert({
      product: "seo",
      kind: "opportunities",
      scope_ref: scope,
      result: { ...opportunitiesResult, generatedAt } as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_google_snapshots").insert({
      product: "seo",
      kind: "internal_link_plan",
      scope_ref: scope,
      result: { ...linkPlanResult, generatedAt } as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "seo_growth_refresh",
      meta: { scopeRef: scope, correlationId, generatedAt },
    });

    return { ok: true, meta: { generatedAt, lowCtrCount: lowCtrPages.length, strikingCount: strikingDistanceQueries.length, indexabilityCount: indexabilityIssues.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "seo_growth_refresh_failed",
      meta: { scopeRef: scope, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
