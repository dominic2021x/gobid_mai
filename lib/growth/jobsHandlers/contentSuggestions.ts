import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getGrowthSetting } from "@/lib/growth/settings";
import { chatCompletion } from "@/lib/growth/llm";

const GSC_SITE_KEY = "gsc_site_url";
const MAX_BRIEFS = 10;
const MAX_INPUT_CHARS = 8000;

const contentBriefSchema = z.object({
  type: z.enum(["category", "guide"]),
  slugSuggestion: z.string(),
  titleIdeas: z.array(z.string()).max(5),
  metaIdeas: z.array(z.string()).max(3),
  outline: z.array(z.string()).max(15),
  faqs: z.array(z.string()).max(5),
  internalLinks: z.array(z.string()).max(8),
});

const briefsSnapshotSchema = z.object({
  briefs: z.array(contentBriefSchema).max(15),
});

export type ContentBrief = z.infer<typeof contentBriefSchema>;

export async function handleContentSuggestionsRefresh(
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
    const [oppSnap, clusterSnap] = await Promise.all([
      supabase
        .from("growth_google_snapshots")
        .select("result")
        .eq("product", "seo")
        .eq("kind", "opportunities")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("growth_google_snapshots")
        .select("result")
        .eq("product", "keywords")
        .eq("kind", "clusters")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const opp = (oppSnap.data?.result ?? null) as { lowCtrPages?: Array<{ page: string }>; strikingDistanceQueries?: Array<{ query: string }> } | null;
    const clusters = (clusterSnap.data?.result ?? null) as { clusters?: Array<{ label: string; keywords: string[]; mappedUrl: string }> } | null;

    const lowCtrPages = opp?.lowCtrPages?.slice(0, 5).map((p) => p.page) ?? [];
    const strikingQueries = opp?.strikingDistanceQueries?.slice(0, 5).map((q) => q.query) ?? [];
    const clusterSummaries = clusters?.clusters?.slice(0, 8).map((c) => ({ label: c.label, keywords: c.keywords.slice(0, 10), mappedUrl: c.mappedUrl })) ?? [];

    const input = {
      lowCtrPages,
      strikingQueries,
      clusters: clusterSummaries,
    };
    let inputStr = JSON.stringify(input);
    if (inputStr.length > MAX_INPUT_CHARS) inputStr = inputStr.slice(0, MAX_INPUT_CHARS - 1) + "}";

    const systemPrompt = `You are a content strategist for a Romanian marketplace. Given SEO opportunities (low-CTR pages, striking-distance queries) and keyword clusters, suggest content briefs. Each brief must have: type ("category" or "guide"), slugSuggestion (URL slug), titleIdeas (array up to 5), metaIdeas (meta descriptions up to 3), outline (array of H2/H3 ideas up to 15), faqs (up to 5 questions), internalLinks (suggested anchor or URL up to 8). Return ONLY a single JSON object: { "briefs": [ { "type": "category"|"guide", "slugSuggestion": "...", "titleIdeas": [], "metaIdeas": [], "outline": [], "faqs": [], "internalLinks": [] } ] }. No markdown. Max ${MAX_BRIEFS} briefs.`;

    const raw = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Data:\n${inputStr}` },
      ],
      { temperature: 0.3, max_tokens: 2048 }
    );

    const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      await supabase.from("growth_events").insert({
        type: "content_suggestions_refresh_failed",
        meta: { scopeRef: scope, correlationId, error: "Invalid JSON from LLM" },
      });
      return { ok: false, error: "Invalid JSON from LLM" };
    }

    const validated = briefsSnapshotSchema.safeParse(parsed);
    if (!validated.success) {
      await supabase.from("growth_events").insert({
        type: "content_suggestions_refresh_failed",
        meta: { scopeRef: scope, correlationId, error: validated.error.message },
      });
      return { ok: false, error: validated.error.message };
    }

    const result = { ...validated.data, generatedAt: new Date().toISOString() };
    await supabase.from("growth_google_snapshots").insert({
      product: "content",
      kind: "briefs",
      scope_ref: scope,
      result: result as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "content_suggestions_refresh",
      meta: { scopeRef: scope, correlationId, generatedAt: result.generatedAt, briefCount: validated.data.briefs.length },
    });
    return { ok: true, meta: { generatedAt: result.generatedAt, briefCount: validated.data.briefs.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "content_suggestions_refresh_failed",
      meta: { scopeRef: scope, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
