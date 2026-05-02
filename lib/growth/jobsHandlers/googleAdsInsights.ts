import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getGrowthSetting } from "@/lib/growth/settings";
import { chatCompletion } from "@/lib/growth/llm";

const PRODUCT = "google_ads";
const KIND = "ads_ai_insights";
const CUSTOMER_KEY = "google_ads_customer_id";

const insightsSchema = z.object({
  topFindings: z.array(z.string()).max(10),
  priorities: z.array(z.string()).max(5),
  safeNextSteps: z.array(z.string()).max(5),
});

export type AdsAiInsights = z.infer<typeof insightsSchema>;

function compactDashboard(d: unknown): string {
  if (!d || typeof d !== "object") return "{}";
  const o = d as Record<string, unknown>;
  const kpis7 = (o.kpis7d as Record<string, unknown>) ?? {};
  const kpis30 = (o.kpis30d as Record<string, unknown>) ?? {};
  return JSON.stringify({
    kpis7d: { spend: kpis7.spend, conversions: kpis7.conversions, cpcMicros: kpis7.cpcMicros, cpaMicros: kpis7.cpaMicros, ctr: kpis7.ctr, convRate: kpis7.convRate },
    kpis30d: { spend: kpis30.spend, conversions: kpis30.conversions, cpcMicros: kpis30.cpcMicros, cpaMicros: kpis30.cpaMicros, ctr: kpis30.ctr, convRate: kpis30.convRate },
    campaignsCount: Array.isArray(o.campaigns30d) ? (o.campaigns30d as unknown[]).length : 0,
  });
}

function compactPlan(plan: unknown): string {
  if (!plan || typeof plan !== "object") return "{}";
  const p = plan as Record<string, unknown>;
  return JSON.stringify({
    planVersion: p.planVersion,
    summary: (p.summary as string) ?? "",
    riskFlags: (p.riskFlags as string[]) ?? [],
    stabilityMode: p.stabilityMode,
    capitalProtectionActive: p.capitalProtectionActive,
    coolingPeriodActive: p.coolingPeriodActive,
    actionsCount: Array.isArray(p.actions) ? (p.actions as unknown[]).length : 0,
  });
}

function compactDigest(digest: unknown): string {
  if (!digest || typeof digest !== "object") return "{}";
  const d = digest as Record<string, unknown>;
  const latest = (d.latestPlan as Record<string, unknown>) ?? {};
  return JSON.stringify({
    date: d.date,
    latestPlanStatus: latest.status,
    latestPlanActionsCount: latest.actionsCount,
    recentJobRunsCount: d.recentJobRunsCount,
  });
}

export async function handleGoogleAdsAiInsightsRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return { ok: false, error: "google_ads_customer_id not set in growth_settings" };
  }
  const cid = customerId.trim();

  try {
    const { data: dashSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", PRODUCT)
      .eq("kind", "ads_dashboard_pack")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: planRow } = await supabase
      .from("growth_ai_plans")
      .select("plan")
      .eq("product", PRODUCT)
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: digestSnap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", PRODUCT)
      .eq("kind", "daily_digest")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dashboardStr = compactDashboard(dashSnap?.result ?? null);
    const planStr = compactPlan((planRow?.plan as Record<string, unknown>) ?? null);
    const digestStr = compactDigest(digestSnap?.result ?? null);

    const userContent = `Google Ads account data (customerId: ${cid}):

DASHBOARD (cached aggregates):
${dashboardStr}

LATEST OPTIMIZER PLAN (v10.1):
${planStr}

LATEST DAILY DIGEST:
${digestStr}

Output a JSON object with exactly these keys (arrays of short strings, read-only insights):
- topFindings: up to 10 brief findings from the data (e.g. "CPA up 20% vs 7d", "3 campaigns with high rank lost IS").
- priorities: up to 5 recommended focus areas (e.g. "Reduce budget on campaign X", "Review negatives").
- safeNextSteps: up to 5 safe next steps (e.g. "Refresh dashboard", "Run optimizer plan", "Check pilot campaigns").

Output ONLY valid JSON, no markdown.`;

    const systemContent = `You are an Enterprise Google Ads analyst. Given dashboard KPIs, optimizer plan summary, and digest, produce read-only AI insights. Reply with a single JSON object: { "topFindings": string[], "priorities": string[], "safeNextSteps": string[] }. No code, no markdown fences.`;

    const raw = await chatCompletion([
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ]);

    const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "OpenAI response was not valid JSON" };
    }

    const validated = insightsSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: `Schema validation failed: ${validated.error.message}` };
    }

    const result = {
      ...validated.data,
      generatedAt: new Date().toISOString(),
    };

    await supabase.from("growth_google_snapshots").insert({
      product: PRODUCT,
      kind: KIND,
      scope_ref: cid,
      result: result as unknown as Record<string, unknown>,
    });

    await supabase.from("growth_events").insert({
      type: "google_ads_ai_insights_refresh",
      meta: { customerId: cid, correlationId, generatedAt: result.generatedAt },
    });

    return { ok: true, meta: { generatedAt: result.generatedAt } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "google_ads_ai_insights_refresh_failed",
      meta: { customerId: cid, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
