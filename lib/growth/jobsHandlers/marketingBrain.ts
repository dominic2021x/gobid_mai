import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getGrowthSetting } from "@/lib/growth/settings";
import { chatCompletion } from "@/lib/growth/llm";

const PRODUCT = "marketing_brain";
const KIND = "analysis";
const MAX_INPUT_CHARS = 12000;

const rootCauseSchema = z.object({
  issue: z.string(),
  evidence: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

const marketingBrainOutputSchema = z.object({
  topFindings: z.array(z.string()).max(15),
  priorities: z.array(z.string()).max(10),
  adsInsights: z.array(z.string()).max(10),
  seoInsights: z.array(z.string()).max(10),
  funnelInsights: z.array(z.string()).max(10),
  rootCauses: z.array(rootCauseSchema).max(10),
});

export type MarketingBrainAnalysis = z.infer<typeof marketingBrainOutputSchema>;

function compactAds(d: unknown): Record<string, unknown> {
  if (!d || typeof d !== "object") return {};
  const o = d as Record<string, unknown>;
  const kpis7 = (o.kpis7d as Record<string, unknown>) ?? {};
  const kpis30 = (o.kpis30d as Record<string, unknown>) ?? {};
  const campaigns30d = (o.campaigns30d as Array<Record<string, unknown>>) ?? [];
  const top = campaigns30d.slice(0, 15).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    cpc: c.cpc,
    cpa: c.cpa,
    conversions: c.conversions,
  }));
  return {
    kpis7d: kpis7,
    kpis30d: kpis30,
    campaigns: top,
  };
}

function compactOptimizer(plan: unknown): Record<string, unknown> {
  if (!plan || typeof plan !== "object") return {};
  const p = plan as Record<string, unknown>;
  return {
    riskFlags: (p.riskFlags as string[]) ?? [],
    stabilityMode: p.stabilityMode,
    capitalProtectionActive: p.capitalProtectionActive,
    coolingPeriodActive: p.coolingPeriodActive,
    summary: (p.summary as string) ?? "",
  };
}

function compactDigest(d: unknown): Record<string, unknown> {
  if (!d || typeof d !== "object") return {};
  const o = d as Record<string, unknown>;
  return {
    date: o.date,
    recentJobRunsCount: o.recentJobRunsCount,
    latestPlan: o.latestPlan,
  };
}

function compactSearchConsole(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const o = result as Record<string, unknown>;
  const rows = (o.rows as Array<Record<string, unknown>>) ?? [];
  const topPages = rows
    .filter((r) => r.keys && (r.keys as string[]).length >= 2)
    .slice(0, 20)
    .map((r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  const topQueries = rows
    .filter((r) => r.keys && (r.keys as string[]).length >= 1)
    .slice(0, 20)
    .map((r) => ({ query: (r.keys as string[])?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr }));
  return { topPages, topQueries, rowCount: rows.length };
}

function compactFunnel(f: unknown): Record<string, unknown> {
  if (!f || typeof f !== "object") return {};
  const o = f as Record<string, unknown>;
  return {
    sessionToSignupPct: o.sessionToSignupPct,
    signupToPublishPct: o.signupToPublishPct,
    publishToPaidPct: o.publishToPaidPct,
    sessions: o.sessions,
    signups: o.signups,
    publishListing: o.publishListing,
    paidBoost: o.paidBoost,
  };
}

export async function handleMarketingBrainAnalysis(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getGrowthSetting("google_ads_customer_id");
  const gscSiteUrl = await getGrowthSetting("gsc_site_url");
  const ga4PropertyId = await getGrowthSetting("ga4_property_id");
  const cid = customerId?.trim() ?? "";

  const input: Record<string, unknown> = {
    ads: null,
    campaigns: null,
    optimizer: null,
    searchConsole: null,
    funnel: null,
    anomalies: [],
  };

  if (cid) {
    const { data: adsSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "google_ads")
      .eq("kind", "ads_dashboard_pack")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (adsSnap?.result) {
      input.ads = compactAds(adsSnap.result);
      const a = input.ads as Record<string, unknown>;
      input.campaigns = a.campaigns;
    }

    const { data: planRow } = await supabase
      .from("growth_ai_plans")
      .select("plan")
      .eq("product", "google_ads")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planRow?.plan) input.optimizer = compactOptimizer(planRow.plan as Record<string, unknown>);

    const { data: digestSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "google_ads")
      .eq("kind", "daily_digest")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (digestSnap?.result) input.digest = compactDigest(digestSnap.result);

    const { data: insightsSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "google_ads")
      .eq("kind", "ads_ai_insights")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (insightsSnap?.result) input.adsAiInsights = (insightsSnap.result as Record<string, unknown>).topFindings;
  }

  if (gscSiteUrl?.trim()) {
    const { data: gscSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "search_console")
      .eq("kind", "performance_overview")
      .eq("scope_ref", gscSiteUrl.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gscSnap?.result) input.searchConsole = compactSearchConsole(gscSnap.result);
  }

  if (ga4PropertyId?.trim()) {
    const { data: funnelSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "ga4")
      .eq("kind", "funnel_overview")
      .eq("scope_ref", ga4PropertyId.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (funnelSnap?.result) input.funnel = compactFunnel(funnelSnap.result);
  }

  const { data: alertsRows } = await supabase
    .from("growth_events")
    .select("type, meta")
    .in("type", ["google_ads_anomaly", "traffic_quality_alert"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (alertsRows?.length) {
    input.anomalies = alertsRows.map((r) => ({ type: r.type, meta: r.meta }));
  }

  let inputStr = JSON.stringify(input);
  if (inputStr.length > MAX_INPUT_CHARS) {
    const trimmed = inputStr.slice(0, Math.max(0, MAX_INPUT_CHARS - 30));
    const lastBrace = trimmed.lastIndexOf("}");
    inputStr = lastBrace > 0 ? trimmed.slice(0, lastBrace + 1) : trimmed + "}";
  }

  const systemPrompt = `You are a senior marketing analyst reviewing a marketplace marketing system. You will receive a JSON object with Ads dashboard KPIs, optimizer signals, optional Search Console performance, and optional GA4 funnel metrics. Return ONLY a single valid JSON object (no markdown, no code fence) with this exact structure:
{
  "topFindings": ["string array, max 15 items"],
  "priorities": ["string array, max 10 items, ranked"],
  "adsInsights": ["string array, CPC/CPA/CTR observations, max 10"],
  "seoInsights": ["string array, pages/queries with impressions but low CTR etc, max 10; omit if no Search Console data"],
  "funnelInsights": ["string array, conversion leaks and funnel stages, max 10; omit if no funnel data"],
  "rootCauses": [
    { "issue": "string", "evidence": "string", "severity": "low" | "medium" | "high" }
  ]
}
Rules: severity must be exactly one of low, medium, high. If a data source is missing, omit or empty the corresponding insights array. Be concise.`;

  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Data:\n${inputStr}` },
      ],
      { temperature: 0.2, max_tokens: 2048 }
    );

    const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      await supabase.from("growth_events").insert({
        type: "marketing_brain_analysis_failed",
        meta: { correlationId, error: "OpenAI response was not valid JSON" },
      });
      return { ok: false, error: "OpenAI response was not valid JSON" };
    }

    const validated = marketingBrainOutputSchema.safeParse(parsed);
    if (!validated.success) {
      await supabase.from("growth_events").insert({
        type: "marketing_brain_analysis_failed",
        meta: { correlationId, error: validated.error.message },
      });
      return { ok: false, error: `Schema validation failed: ${validated.error.message}` };
    }

    const result = {
      ...validated.data,
      generatedAt: new Date().toISOString(),
    };

    await supabase.from("growth_google_snapshots").insert({
      product: PRODUCT,
      kind: KIND,
      scope_ref: "default",
      result: result as unknown as Record<string, unknown>,
    });

    await supabase.from("growth_events").insert({
      type: "marketing_brain_analysis",
      meta: { correlationId, generatedAt: result.generatedAt },
    });

    return { ok: true, meta: { generatedAt: result.generatedAt } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "marketing_brain_analysis_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
