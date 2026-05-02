import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";

const SCOPE_DEFAULT = "default";

export async function handleGrowthOsDailyPack(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getGrowthSetting("google_ads_customer_id");
  const siteUrl = await getGrowthSetting("gsc_site_url");
  const cid = customerId?.trim() ?? "";
  const scope = siteUrl?.trim() ?? "";

  try {
    const [adsSnap, brainSnap, seoOppSnap, seoLinkSnap, kwSnap, contentSnap] = await Promise.all([
      cid
        ? supabase
            .from("growth_google_snapshots")
            .select("result, created_at")
            .eq("product", "google_ads")
            .eq("kind", "ads_dashboard_pack")
            .eq("scope_ref", cid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null },
      supabase
        .from("growth_google_snapshots")
        .select("result, created_at")
        .eq("product", "marketing_brain")
        .eq("kind", "analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      scope
        ? supabase
            .from("growth_google_snapshots")
            .select("result, created_at")
            .eq("product", "seo")
            .eq("kind", "opportunities")
            .eq("scope_ref", scope)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null },
      scope
        ? supabase
            .from("growth_google_snapshots")
            .select("result, created_at")
            .eq("product", "seo")
            .eq("kind", "internal_link_plan")
            .eq("scope_ref", scope)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null },
      scope
        ? supabase
            .from("growth_google_snapshots")
            .select("result, created_at")
            .eq("product", "keywords")
            .eq("kind", "clusters")
            .eq("scope_ref", scope)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null },
      scope
        ? supabase
            .from("growth_google_snapshots")
            .select("result, created_at")
            .eq("product", "content")
            .eq("kind", "briefs")
            .eq("scope_ref", scope)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null },
    ]);

    const dailyPack = {
      generatedAt: new Date().toISOString(),
      adsDashboard: adsSnap.data?.result ?? null,
      adsDashboardAt: (adsSnap.data as { created_at?: string } | null)?.created_at ?? null,
      marketingBrain: brainSnap.data?.result ?? null,
      marketingBrainAt: (brainSnap.data as { created_at?: string } | null)?.created_at ?? null,
      seoOpportunities: seoOppSnap.data?.result ?? null,
      seoOpportunitiesAt: (seoOppSnap.data as { created_at?: string } | null)?.created_at ?? null,
      seoInternalLinkPlan: seoLinkSnap.data?.result ?? null,
      seoInternalLinkPlanAt: (seoLinkSnap.data as { created_at?: string } | null)?.created_at ?? null,
      keywordClusters: kwSnap.data?.result ?? null,
      keywordClustersAt: (kwSnap.data as { created_at?: string } | null)?.created_at ?? null,
      contentBriefs: contentSnap.data?.result ?? null,
      contentBriefsAt: (contentSnap.data as { created_at?: string } | null)?.created_at ?? null,
    };

    await supabase.from("growth_google_snapshots").insert({
      product: "growth_os",
      kind: "daily_pack",
      scope_ref: SCOPE_DEFAULT,
      result: dailyPack as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "growth_os_daily_pack",
      meta: { correlationId, generatedAt: dailyPack.generatedAt },
    });
    return { ok: true, meta: { generatedAt: dailyPack.generatedAt } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "growth_os_daily_pack_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
