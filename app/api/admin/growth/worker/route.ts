import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { insertJobRun, type GrowthJobRow } from "@/lib/growth/jobs";
import { claimNextJob } from "@/lib/growth/jobs/claimNextJob";
import { completeJob } from "@/lib/growth/jobs/completeJob";
import { failJob } from "@/lib/growth/jobs/failJob";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const JOB_TYPES = [
  "seo_sitemap_ping",
  "seo_rules_evaluate_batch",
  "seo_audit_run",
  "seo_index_request",
  "google_ads_report",
  "google_ads_conversion_actions_refresh",
  "google_ads_conversion_action_create",
  "google_ads_conversions_upload",
  "gsc_performance_pull",
  "ga4_report_pull",
  "google_ads_optimizer_plan",
  "google_ads_apply_plan",
  "google_ads_search_terms_refresh",
  "google_ads_optimizer_auto_apply",
  "google_ads_anomaly_check",
  "google_ads_keyword_quality_refresh",
  "google_ads_hourly_performance_refresh",
  "google_ads_device_performance_refresh",
  "google_ads_geo_performance_refresh",
  "google_ads_network_performance_refresh",
  "google_ads_matchtype_performance_refresh",
  "google_ads_auction_pressure_refresh",
  "google_ads_search_terms_structure_refresh",
  "traffic_quality_monitor",
  "google_ads_optimizer_daily_digest",
  "google_ads_campaign_pause",
  "google_ads_campaign_enable",
  "google_ads_campaign_budget",
  "google_ads_campaign_bidding",
  "google_ads_dashboard_refresh",
  "google_ads_ai_insights_refresh",
  "google_search_console_performance_refresh",
  "ga4_funnel_refresh",
  "marketing_brain_analysis",
  "seo_growth_refresh",
  "keyword_discovery_refresh",
  "content_suggestions_refresh",
  "growth_os_daily_pack",
  "seo_apply_overrides",
  "seo_internal_links_generate",
  "seo_internal_links_apply",
  "pseo_generate_candidates",
  "pseo_score_and_promote",
  "pseo_seed_internal_links",
  "pseo_demotion",
  "pseo_enrich_content",
  "pseo_geo_generate_candidates",
  "seo_flywheel_rank_opportunities",
  "seo_flywheel_ctr_experiments",
  "seo_flywheel_hubs_generate",
  "seo_flywheel_weekly_prune",
  "demand_mining_refresh",
  "demand_mining_create_candidates",
  "market_trends_refresh",
  "market_trends_apply",
  "semantic_graph_refresh",
  "semantic_graph_embeddings_refresh",
  "semantic_graph_link_recs_refresh",
  "semantic_graph_pages_seed",
  "search_intel_rollup_hourly",
  "search_intel_rollup_hourly_ips",
  "search_intel_learn_weights_daily",
  "search_intel_update_query_boosts_daily",
  "search_personal_rollup_daily",
  "demand_flywheel_refresh",
  "demand_flywheel_execute",
  "demand_flywheel_feedback_eval",
  "saved_search_alerts_scan",
  "saved_search_digest_build",
  "saved_search_digest_send_daily",
  "saved_search_digest_send_weekly",
  "supply_gap_refresh",
  "supply_gap_activate",
] as const;

function hasCronSecret(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const legacy = req.headers.get("x-cron-secret");
  const secret = token ?? legacy;
  return !!(secret && secret === process.env.CRON_SECRET);
}

function instanceId(req: Request): string {
  const vercelId = req.headers.get("x-vercel-id");
  if (vercelId) return `v:${vercelId}`;
  const requestId = req.headers.get("x-request-id");
  if (requestId) return `r:${requestId}`;
  return `growth-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function safeErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

type JobResult = { ok: boolean; meta?: Record<string, unknown>; error?: string; unknownType?: boolean };
async function runJob(job: GrowthJobRow, corrId: string): Promise<JobResult> {
  const supabase = createAdminClient();
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  switch (job.type) {
    case "seo_sitemap_ping": {
      const sitemapUrl = (payload.sitemapUrl as string) || "https://gobid.ro/sitemap.xml";
      try {
        await fetch(sitemapUrl, { method: "HEAD", cache: "no-store" });
      } catch (e) {
        return { ok: false, error: safeErrMessage(e) };
      }
      return { ok: true, meta: { sitemapUrl } };
    }
    case "seo_rules_evaluate_batch":
      return { ok: true, meta: { batch: true } };
    case "seo_audit_run": {
      const hash = `audit-${Date.now()}`;
      await supabase.from("growth_audit_results").insert({
        kind: "seo_audit_run",
        hash,
        result: { ranAt: new Date().toISOString(), correlationId: corrId, stub: true },
      });
      return { ok: true, meta: { hash } };
    }
    case "seo_index_request":
      return { ok: true, meta: { urls: (payload.urls as string[]) ?? [] } };
    case "google_ads_report": {
      const { handleGoogleAdsReport } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsReport(payload, corrId, supabase);
    }
    case "google_ads_conversion_actions_refresh": {
      const { handleGoogleAdsConversionActionsRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsConversionActionsRefresh(payload, corrId, supabase);
    }
    case "google_ads_conversion_action_create": {
      const { handleGoogleAdsConversionActionCreate } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsConversionActionCreate(payload, corrId, supabase);
    }
    case "google_ads_conversions_upload": {
      const { handleGoogleAdsConversionsUpload } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsConversionsUpload(payload, corrId, supabase);
    }
    case "gsc_performance_pull": {
      const { handleGscPerformancePull } = await import("@/lib/growth/jobsHandlers/searchConsole");
      return handleGscPerformancePull(payload, corrId, supabase);
    }
    case "ga4_report_pull": {
      const { handleGa4ReportPull } = await import("@/lib/growth/jobsHandlers/ga4");
      return handleGa4ReportPull(payload, corrId, supabase);
    }
    case "google_ads_optimizer_plan": {
      const { handleGoogleAdsOptimizerPlan } = await import("@/lib/growth/jobsHandlers/adsOptimizer");
      return handleGoogleAdsOptimizerPlan(payload, corrId, supabase);
    }
    case "google_ads_apply_plan": {
      const { handleGoogleAdsApplyPlan } = await import("@/lib/growth/jobsHandlers/adsOptimizer");
      return handleGoogleAdsApplyPlan(payload, corrId, supabase);
    }
    case "google_ads_search_terms_refresh": {
      const { handleGoogleAdsSearchTermsRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsSearchTermsRefresh(payload, corrId, supabase);
    }
    case "google_ads_optimizer_auto_apply": {
      const { runWithGuardrails } = await import("@/lib/growth/guardrails/runGuarded");
      const { handleGoogleAdsOptimizerAutoApply } = await import("@/lib/growth/jobsHandlers/adsOptimizer");
      return runWithGuardrails(supabase, job.type, corrId, () =>
        handleGoogleAdsOptimizerAutoApply(payload, corrId, supabase)
      );
    }
    case "google_ads_anomaly_check": {
      const { handleGoogleAdsAnomalyCheck } = await import("@/lib/growth/jobsHandlers/googleAdsAnomaly");
      return handleGoogleAdsAnomalyCheck(payload, corrId, supabase);
    }
    case "google_ads_keyword_quality_refresh": {
      const { handleGoogleAdsKeywordQualityRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsKeywordQualityRefresh(payload, corrId, supabase);
    }
    case "google_ads_hourly_performance_refresh": {
      const { handleGoogleAdsHourlyPerformanceRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsHourlyPerformanceRefresh(payload, corrId, supabase);
    }
    case "google_ads_device_performance_refresh": {
      const { handleGoogleAdsDevicePerformanceRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsDevicePerformanceRefresh(payload, corrId, supabase);
    }
    case "google_ads_geo_performance_refresh": {
      const { handleGoogleAdsGeoPerformanceRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsGeoPerformanceRefresh(payload, corrId, supabase);
    }
    case "google_ads_network_performance_refresh": {
      const { handleGoogleAdsNetworkPerformanceRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsNetworkPerformanceRefresh(payload, corrId, supabase);
    }
    case "google_ads_matchtype_performance_refresh": {
      const { handleGoogleAdsMatchtypePerformanceRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsMatchtypePerformanceRefresh(payload, corrId, supabase);
    }
    case "google_ads_auction_pressure_refresh": {
      const { handleGoogleAdsAuctionPressureRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsAuctionPressureRefresh(payload, corrId, supabase);
    }
    case "google_ads_search_terms_structure_refresh": {
      const { handleGoogleAdsSearchTermsStructureRefresh } = await import("@/lib/growth/jobsHandlers/googleAds");
      return handleGoogleAdsSearchTermsStructureRefresh(payload, corrId, supabase);
    }
    case "traffic_quality_monitor": {
      const { handleTrafficQualityMonitor } = await import("@/lib/growth/jobsHandlers/trafficQuality");
      return handleTrafficQualityMonitor(payload, corrId, supabase);
    }
    case "google_ads_optimizer_daily_digest": {
      const { handleGoogleAdsOptimizerDailyDigest } = await import("@/lib/growth/jobsHandlers/adsOptimizer");
      return handleGoogleAdsOptimizerDailyDigest(payload, corrId, supabase);
    }
    case "google_ads_campaign_pause": {
      const { handleGoogleAdsCampaignPause } = await import("@/lib/growth/jobsHandlers/googleAdsControl");
      return handleGoogleAdsCampaignPause(payload, corrId, supabase);
    }
    case "google_ads_campaign_enable": {
      const { handleGoogleAdsCampaignEnable } = await import("@/lib/growth/jobsHandlers/googleAdsControl");
      return handleGoogleAdsCampaignEnable(payload, corrId, supabase);
    }
    case "google_ads_campaign_budget": {
      const { handleGoogleAdsCampaignBudget } = await import("@/lib/growth/jobsHandlers/googleAdsControl");
      return handleGoogleAdsCampaignBudget(payload, corrId, supabase);
    }
    case "google_ads_campaign_bidding": {
      const { handleGoogleAdsCampaignBidding } = await import("@/lib/growth/jobsHandlers/googleAdsControl");
      return handleGoogleAdsCampaignBidding(payload, corrId, supabase);
    }
    case "google_ads_dashboard_refresh": {
      const { handleGoogleAdsDashboardRefresh } = await import("@/lib/growth/jobsHandlers/googleAdsDashboard");
      return handleGoogleAdsDashboardRefresh(payload, corrId, supabase);
    }
    case "google_ads_ai_insights_refresh": {
      const { handleGoogleAdsAiInsightsRefresh } = await import("@/lib/growth/jobsHandlers/googleAdsInsights");
      return handleGoogleAdsAiInsightsRefresh(payload, corrId, supabase);
    }
    case "google_search_console_performance_refresh": {
      const { handleGoogleSearchConsolePerformanceRefresh } = await import("@/lib/growth/jobsHandlers/searchConsole");
      return handleGoogleSearchConsolePerformanceRefresh(payload, corrId, supabase);
    }
    case "ga4_funnel_refresh": {
      const { handleGa4FunnelRefresh } = await import("@/lib/growth/jobsHandlers/ga4");
      return handleGa4FunnelRefresh(payload, corrId, supabase);
    }
    case "marketing_brain_analysis": {
      const { handleMarketingBrainAnalysis } = await import("@/lib/growth/jobsHandlers/marketingBrain");
      return handleMarketingBrainAnalysis(payload, corrId, supabase);
    }
    case "seo_growth_refresh": {
      const { handleSeoGrowthRefresh } = await import("@/lib/growth/jobsHandlers/seoGrowth");
      return handleSeoGrowthRefresh(payload, corrId, supabase);
    }
    case "keyword_discovery_refresh": {
      const { handleKeywordDiscoveryRefresh } = await import("@/lib/growth/jobsHandlers/keywordDiscovery");
      return handleKeywordDiscoveryRefresh(payload, corrId, supabase);
    }
    case "content_suggestions_refresh": {
      const { handleContentSuggestionsRefresh } = await import("@/lib/growth/jobsHandlers/contentSuggestions");
      return handleContentSuggestionsRefresh(payload, corrId, supabase);
    }
    case "growth_os_daily_pack": {
      const { handleGrowthOsDailyPack } = await import("@/lib/growth/jobsHandlers/growthOs");
      return handleGrowthOsDailyPack(payload, corrId, supabase);
    }
    case "seo_apply_overrides": {
      const { handleSeoApplyOverrides } = await import("@/lib/growth/jobsHandlers/seoApply");
      return handleSeoApplyOverrides(payload, corrId, supabase);
    }
    case "seo_internal_links_generate": {
      const { handleSeoInternalLinksGenerate } = await import("@/lib/growth/jobsHandlers/internalLinks");
      return handleSeoInternalLinksGenerate(payload, corrId, supabase);
    }
    case "seo_internal_links_apply": {
      const { handleSeoInternalLinksApply } = await import("@/lib/growth/jobsHandlers/internalLinks");
      return handleSeoInternalLinksApply(payload, corrId, supabase);
    }
    case "pseo_generate_candidates": {
      const { runWithGuardrails } = await import("@/lib/growth/guardrails/runGuarded");
      const { handlePseoGenerateCandidates } = await import("@/lib/growth/jobsHandlers/programmaticSeo");
      return runWithGuardrails(supabase, job.type, corrId, () =>
        handlePseoGenerateCandidates(payload, corrId, supabase)
      );
    }
    case "pseo_score_and_promote": {
      const { runWithGuardrails } = await import("@/lib/growth/guardrails/runGuarded");
      const { handlePseoScoreAndPromote } = await import("@/lib/growth/jobsHandlers/programmaticSeo");
      return runWithGuardrails(supabase, job.type, corrId, () =>
        handlePseoScoreAndPromote(payload, corrId, supabase)
      );
    }
    case "pseo_seed_internal_links": {
      const { handlePseoSeedInternalLinks } = await import("@/lib/growth/jobsHandlers/programmaticSeo");
      return handlePseoSeedInternalLinks(payload, corrId, supabase);
    }
    case "pseo_demotion": {
      const { handlePseoDemotion } = await import("@/lib/growth/jobsHandlers/programmaticSeo");
      return handlePseoDemotion(payload, corrId, supabase);
    }
    case "pseo_enrich_content": {
      const { handlePseoEnrichContent } = await import("@/lib/growth/jobsHandlers/programmaticSeo");
      return handlePseoEnrichContent(payload, corrId, supabase);
    }
    case "pseo_geo_generate_candidates": {
      const { handlePseoGeoGenerateCandidates } = await import("@/lib/growth/jobsHandlers/pseoGeoExpansion");
      return handlePseoGeoGenerateCandidates(payload, corrId, supabase);
    }
    case "seo_flywheel_rank_opportunities": {
      const { runWithGuardrails } = await import("@/lib/growth/guardrails/runGuarded");
      const { handleSeoFlywheelRankOpportunities } = await import("@/lib/growth/jobsHandlers/seoFlywheel");
      return runWithGuardrails(supabase, job.type, corrId, () =>
        handleSeoFlywheelRankOpportunities(payload, corrId, supabase)
      );
    }
    case "seo_flywheel_ctr_experiments": {
      const { handleSeoFlywheelCtrExperiments } = await import("@/lib/growth/jobsHandlers/seoFlywheel");
      return handleSeoFlywheelCtrExperiments(payload, corrId, supabase);
    }
    case "seo_flywheel_hubs_generate": {
      const { handleSeoFlywheelHubsGenerate } = await import("@/lib/growth/jobsHandlers/seoFlywheel");
      return handleSeoFlywheelHubsGenerate(payload, corrId, supabase);
    }
    case "seo_flywheel_weekly_prune": {
      const { handleSeoFlywheelWeeklyPrune } = await import("@/lib/growth/jobsHandlers/seoFlywheel");
      return handleSeoFlywheelWeeklyPrune(payload, corrId, supabase);
    }
    case "demand_mining_refresh": {
      const { handleDemandMiningRefresh } = await import("@/lib/growth/jobsHandlers/demandMining");
      return handleDemandMiningRefresh(payload, corrId, supabase);
    }
    case "demand_mining_create_candidates": {
      const { handleDemandMiningCreateCandidates } = await import("@/lib/growth/jobsHandlers/demandMining");
      return handleDemandMiningCreateCandidates(payload, corrId, supabase);
    }
    case "market_trends_refresh": {
      const { handleMarketTrendsRefresh } = await import("@/lib/growth/jobsHandlers/trends");
      return handleMarketTrendsRefresh(payload, corrId, supabase);
    }
    case "market_trends_apply": {
      const { handleMarketTrendsApply } = await import("@/lib/growth/jobsHandlers/trends");
      return handleMarketTrendsApply(payload, corrId, supabase);
    }
    case "semantic_graph_refresh": {
      const { handleSemanticGraphRefresh } = await import("@/lib/growth/jobsHandlers/semanticGraph");
      return handleSemanticGraphRefresh(payload, corrId, supabase);
    }
    case "semantic_graph_embeddings_refresh": {
      const { handleSemanticGraphEmbeddingsRefresh } = await import("@/lib/growth/jobsHandlers/semanticGraph");
      return handleSemanticGraphEmbeddingsRefresh(payload, corrId, supabase);
    }
    case "semantic_graph_link_recs_refresh": {
      const { handleSemanticGraphLinkRecsRefresh } = await import("@/lib/growth/jobsHandlers/semanticGraph");
      return handleSemanticGraphLinkRecsRefresh(payload, corrId, supabase);
    }
    case "semantic_graph_pages_seed": {
      const { handleSemanticGraphPagesSeed } = await import("@/lib/growth/jobsHandlers/semanticGraph");
      return handleSemanticGraphPagesSeed(payload, corrId, supabase);
    }
    case "search_intel_rollup_hourly": {
      const { handleSearchIntelRollupHourly } = await import("@/lib/growth/jobsHandlers/searchIntelligence");
      return handleSearchIntelRollupHourly(payload, corrId, supabase);
    }
    case "search_intel_learn_weights_daily": {
      const { handleSearchIntelLearnWeightsDaily } = await import("@/lib/growth/jobsHandlers/searchIntelligence");
      return handleSearchIntelLearnWeightsDaily(payload, corrId, supabase);
    }
    case "search_intel_update_query_boosts_daily": {
      const { handleSearchIntelUpdateQueryBoostsDaily } = await import("@/lib/growth/jobsHandlers/searchIntelligence");
      return handleSearchIntelUpdateQueryBoostsDaily(payload, corrId, supabase);
    }
    case "search_intel_rollup_hourly_ips": {
      const { handleSearchIntelRollupHourlyIps } = await import("@/lib/growth/jobsHandlers/searchIntelligenceIps");
      return handleSearchIntelRollupHourlyIps(payload, corrId, supabase);
    }
    case "search_personal_rollup_daily": {
      const { handleSearchPersonalRollupDaily } = await import("@/lib/growth/jobsHandlers/searchPersonal");
      return handleSearchPersonalRollupDaily(payload, corrId, supabase);
    }
    case "demand_flywheel_refresh": {
      const { handleDemandFlywheelRefresh } = await import("@/lib/growth/jobsHandlers/demandFlywheel");
      return handleDemandFlywheelRefresh(payload, corrId, supabase);
    }
    case "demand_flywheel_execute": {
      const { runWithGuardrails } = await import("@/lib/growth/guardrails/runGuarded");
      const { handleDemandFlywheelExecute } = await import("@/lib/growth/jobsHandlers/demandFlywheel");
      return runWithGuardrails(supabase, job.type, corrId, () =>
        handleDemandFlywheelExecute(payload, corrId, supabase)
      );
    }
    case "demand_flywheel_feedback_eval": {
      const { handleDemandFlywheelFeedbackEval } = await import("@/lib/growth/jobsHandlers/demandFlywheel");
      return handleDemandFlywheelFeedbackEval(payload, corrId, supabase);
    }
    case "saved_search_alerts_scan": {
      const { runSavedSearchAlerts } = await import("@/lib/growth/jobs/savedSearchAlerts");
      const result = await runSavedSearchAlerts(supabase);
      return result.ok
        ? { ok: true, meta: { processed: result.processed, notified: result.notified, digestQueued: result.digestQueued } }
        : { ok: false, error: result.error ?? "saved_search_alerts_scan failed" };
    }
    case "saved_search_digest_build": {
      const { handleSavedSearchDigestBuild } = await import("@/lib/growth/jobsHandlers/savedSearchDigest");
      return handleSavedSearchDigestBuild(payload, corrId, supabase);
    }
    case "saved_search_digest_send_daily": {
      const { runSavedSearchDigestSend } = await import("@/lib/growth/jobsHandlers/savedSearchDigestSend");
      return runSavedSearchDigestSend(supabase, { mode: "daily_digest", correlationId: corrId });
    }
    case "saved_search_digest_send_weekly": {
      const { runSavedSearchDigestSend } = await import("@/lib/growth/jobsHandlers/savedSearchDigestSend");
      return runSavedSearchDigestSend(supabase, { mode: "weekly_digest", correlationId: corrId });
    }
    case "supply_gap_refresh": {
      const { runSupplyGapRefresh } = await import("@/lib/growth/jobs/supplyGapRefresh");
      const result = await runSupplyGapRefresh(supabase);
      return result.ok
        ? { ok: true, meta: { processed: result.processed } }
        : { ok: false, error: result.error ?? "supply_gap_refresh failed" };
    }
    case "supply_gap_activate": {
      const { runSupplyGapActivate } = await import("@/lib/growth/jobs/supplyGapActivate");
      const result = await runSupplyGapActivate(supabase);
      return result.ok
        ? { ok: true, meta: { gapsProcessed: result.gapsProcessed, actionsCreated: result.actionsCreated, notificationsSent: result.notificationsSent } }
        : { ok: false, error: result.error ?? "supply_gap_activate failed" };
    }
    default:
      return { ok: false, error: `Unknown job type: ${job.type}`, unknownType: true };
  }
}

export async function GET(req: NextRequest) {
  let authOk = false;
  try {
    if (hasCronSecret(req)) {
      authOk = true;
    } else {
      const auth = await requireAdmin(req);
      if (auth.ok) authOk = true;
      else return auth.response;
    }
  } catch {
    return growthJsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  if (!authOk) return growthJsonError("Forbidden", "FORBIDDEN", 403);

  const supabase = createAdminClient();
  const instId = instanceId(req);
  const corrId = instId.startsWith("growth-") ? instId : `growth-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  let claimedJob: GrowthJobRow | null = null;
  let runId: string | null = null;

  try {
    claimedJob = await claimNextJob(supabase, { instanceId: instId });
    if (!claimedJob) {
      return NextResponse.json({
        ok: true,
        message: "No queued jobs found",
        correlationId: corrId,
      });
    }

    const runResult = await insertJobRun(claimedJob.id, corrId, supabase);
    runId = runResult.runId;
    console.info("[growth.worker] job started", { correlationId: corrId, jobId: claimedJob.id, type: claimedJob.type });

    const result = await runJob(claimedJob, corrId);

    if (result.ok) {
      await completeJob(supabase, {
        jobId: claimedJob.id,
        runId,
        meta: (result.meta ?? {}) as Record<string, unknown>,
      });
      return NextResponse.json({
        ok: true,
        jobId: claimedJob.id,
        type: claimedJob.type,
        correlationId: corrId,
        meta: result.meta,
      });
    }

    await failJob(supabase, {
      jobId: claimedJob.id,
      runId,
      correlationId: corrId,
      errorMessage: result.error ?? "Job failed",
      backoffSeconds: 60,
      immediateQuarantine: !!result.unknownType,
    });
    return NextResponse.json({
      ok: false,
      jobId: claimedJob.id,
      type: claimedJob.type,
      correlationId: corrId,
      error: result.error,
    });
  } catch (err) {
    if (claimedJob && runId) {
      try {
        await failJob(supabase, {
          jobId: claimedJob.id,
          runId,
          correlationId: corrId,
          errorMessage: safeErrMessage(err),
          backoffSeconds: 60,
        });
      } catch (e) {
        console.error("[growth.worker] failJob error:", (e as Error)?.message);
      }
    }
    console.error("[growth.worker] correlationId=%s error=%s", corrId, safeErrMessage(err));
    return growthJsonError(safeErrMessage(err), "INTERNAL_ERROR", 500, corrId);
  }
}
