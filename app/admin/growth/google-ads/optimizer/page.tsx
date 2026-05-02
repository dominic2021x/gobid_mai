"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";
import GrowthPageShell from "../../_components/GrowthPageShell";

interface Guardrails {
  ads_max_budget_change_pct: number;
  ads_max_actions_per_day: number;
  ads_allow_pause: boolean;
  ads_allow_negatives: boolean;
  ads_min_days_between_changes: number;
  ads_min_conversions_for_budget_increase?: number;
  ads_cap_spend_per_day_micros?: number;
  ads_auto_apply_mode?: string;
  ads_min_readiness_for_full_plan?: number;
  ads_max_target_cpa_change_pct?: number;
  ads_allow_pause_low_qs_keyword?: boolean;
  ads_max_bid_modifier_change_pct?: number;
  ads_hourly_cost_threshold_micros?: number;
  ads_network_cost_threshold_micros?: number;
  ads_allow_disable_search_partners?: boolean;
  ads_allow_pause_keyword?: boolean;
  traffic_quality_click_session_ratio_threshold?: number;
  traffic_quality_min_sessions?: number;
  ads_primary_objective?: string;
  ads_search_term_overlap_threshold?: number;
  ads_click_quality_index_threshold?: number;
  ads_min_days_between_budget_changes?: number;
  ads_min_days_between_bid_changes?: number;
}

interface PlanAction {
  type: string;
  reason?: string;
  confidence?: number;
  autoApplyEligible?: boolean;
  evidence?: Array<{ term?: string; impressions?: number; costMicros?: number; conversions?: number }>;
  landingPage?: string;
  suggestedFix?: string;
  campaignId?: string;
  newBudgetMicros?: number;
  currentBudgetMicros?: number;
  newTargetCpaMicros?: number;
  currentTargetCpaMicros?: number;
  currentBidModifier?: number;
  newBidModifier?: number;
  criterionResourceName?: string;
  qualityScore?: number;
  resourceName?: string;
  criterionId?: string;
  adGroupId?: string;
  currentBidMicros?: number;
  newBidMicros?: number;
  budgetConcentrationIndex?: number;
  conversions30d?: number;
  currentStrategy?: string;
  ctr?: number;
  conversionRate?: number;
  stage?: string;
  dropPct?: number;
  finalConversions?: number;
  microEventCount?: number;
  keywordCount?: number;
  term?: string;
  cpa7d?: number;
  cpa14d?: number;
  elasticity?: number;
  marginalCpaMicros?: number;
  averageCpaMicros?: number;
  [key: string]: unknown;
}

interface PlanRecord {
  id: string;
  product: string;
  scope_ref: string;
  plan: {
    planVersion?: number;
    customerId?: string;
    generatedAt?: string;
    summary?: string;
    conversionReadinessScore?: number;
    planType?: "full" | "tracking_only";
    statisticalConfidenceLevel?: "low" | "medium" | "high";
    deterministicActionsCount?: number;
    biddingStrategyAware?: boolean;
    cpcReductionMode?: boolean;
    trafficQualityMode?: boolean;
    intentMode?: boolean;
    auctionAware?: boolean;
    structuralMode?: boolean;
    architectureMode?: boolean;
    conversionSystemMode?: boolean;
    economicMode?: boolean;
    stabilityMode?: boolean;
    capitalProtectionActive?: boolean;
    coolingPeriodActive?: boolean;
    brandIsolationDetected?: boolean;
    signalDensityScore?: number;
    budgetConcentrationIndex?: number;
    stabilityScore?: number;
    maxAffordableCpa?: number;
    maxSustainableCpa?: number;
    elasticityScore?: number;
    scalingSignals?: { scaleWindowCampaignIds?: string[]; elasticityAllowIncreaseCampaignIds?: string[]; elasticityScoreByCampaign?: Record<string, number> };
    funnelMetrics?: { sessions?: number; signups?: number; publishListing?: number; paidBoost?: number; sessionToSignupPct?: number; signupToPublishPct?: number; publishToPaidPct?: number };
    primaryObjective?: string;
    clickQualityIndex?: number;
    effectiveTargetCpcMicros?: number;
    actions?: PlanAction[];
    riskFlags?: string[];
  };
  status: string;
  created_at: string;
  updated_at?: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GrowthGoogleAdsOptimizerPage() {
  const [latestPlan, setLatestPlan] = useState<PlanRecord | null>(null);
  const [plansHistory, setPlansHistory] = useState<PlanRecord[]>([]);
  const [guardrails, setGuardrails] = useState<Guardrails | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingGuardrails, setLoadingGuardrails] = useState(true);
  const [enqueueingPlan, setEnqueueingPlan] = useState(false);
  const [enqueueingApply, setEnqueueingApply] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [anomalyEvent, setAnomalyEvent] = useState<{ id: string; type: string; meta?: { anomalies?: unknown[]; at?: string }; created_at: string } | null>(null);
  const [loadingAnomaly, setLoadingAnomaly] = useState(true);
  const [enqueueingAnomaly, setEnqueueingAnomaly] = useState(false);
  const [trafficQualityAlerts, setTrafficQualityAlerts] = useState<Array<{ id: string; meta?: Record<string, unknown>; created_at: string }>>([]);
  const [loadingTrafficQuality, setLoadingTrafficQuality] = useState(true);
  const [enqueueingTrafficQuality, setEnqueueingTrafficQuality] = useState(false);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/plan/latest", {
      });
      if (res.ok) {
        const data = await res.json();
        setLatestPlan(data.plan ?? null);
      }
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/plans?limit=10", {
      });
      if (res.ok) {
        const data = await res.json();
        setPlansHistory(data.plans ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchGuardrails = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingGuardrails(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/guardrails", {
      });
      if (res.ok) {
        const data = await res.json();
        setGuardrails(data);
      }
    } finally {
      setLoadingGuardrails(false);
    }
  }, []);

  const fetchTrafficQualityAlerts = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingTrafficQuality(true);
    try {
      const res = await fetch("/api/admin/growth/traffic-quality/alerts", {
      });
      if (res.ok) {
        const data = await res.json();
        setTrafficQualityAlerts(data.alerts ?? []);
      }
    } finally {
      setLoadingTrafficQuality(false);
    }
  }, []);

  const fetchAnomalyStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingAnomaly(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/anomaly/status", {
      });
      if (res.ok) {
        const data = await res.json();
        setAnomalyEvent(data.event ?? null);
      }
    } finally {
      setLoadingAnomaly(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    fetchHistory();
    fetchGuardrails();
    fetchAnomalyStatus();
    fetchTrafficQualityAlerts();
  }, [fetchLatest, fetchHistory, fetchGuardrails, fetchAnomalyStatus, fetchTrafficQualityAlerts]);

  const handleGeneratePlan = async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setEnqueueingPlan(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/plan/enqueue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: forceNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Job enqueued: ${data.jobId}. Rulează worker-ul sau așteaptă cron.` });
      setTimeout(() => {
        fetchLatest();
        fetchHistory();
      }, 2000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setEnqueueingPlan(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!latestPlan || latestPlan.status !== "queued") return;
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setEnqueueingApply(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/apply/enqueue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId: latestPlan.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Apply job enqueued: ${data.jobId}. Rulează worker-ul.` });
      setTimeout(() => {
        fetchLatest();
        fetchHistory();
      }, 2000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setEnqueueingApply(false);
    }
  };

  const handleEnqueueAnomaly = async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setEnqueueingAnomaly(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/anomaly/enqueue", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Anomaly check enqueued: ${data.jobId}. Rulează worker-ul.` });
      setTimeout(fetchAnomalyStatus, 2000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setEnqueueingAnomaly(false);
    }
  };

  return (
    <GrowthPageShell
      title="Ads Optimizer v10.1"
      description="Stability Mode: conservative scaling (elasticity &gt; 1.2), capital protection, cooling period. Max budget +10%, min 7 days between budget increases."
      actions={
        <Link
          href="/admin/growth/google-ads/optimizer/ops"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-md hover:from-amber-600 hover:to-orange-600"
        >
          Ops (kill switch &amp; daily)
        </Link>
      }
    >
      <div className="space-y-6">
      {guardrails !== null && (
        <Card title="Guardrails" description="Limite curente (growth_settings)" accent="amber">
          <ul className="space-y-1 text-sm text-slate-700">
            <li><strong>ads_max_budget_change_pct:</strong> {guardrails.ads_max_budget_change_pct}%</li>
            <li><strong>ads_max_actions_per_day:</strong> {guardrails.ads_max_actions_per_day}</li>
            <li><strong>ads_allow_pause:</strong> {guardrails.ads_allow_pause ? "Da" : "Nu"}</li>
            <li><strong>ads_allow_negatives:</strong> {guardrails.ads_allow_negatives ? "Da" : "Nu"}</li>
            <li><strong>ads_min_days_between_changes:</strong> {guardrails.ads_min_days_between_changes} zile</li>
            {guardrails.ads_min_conversions_for_budget_increase != null && (
              <li><strong>ads_min_conversions_for_budget_increase:</strong> {guardrails.ads_min_conversions_for_budget_increase}</li>
            )}
            {guardrails.ads_cap_spend_per_day_micros != null && (
              <li><strong>ads_cap_spend_per_day_micros:</strong> {guardrails.ads_cap_spend_per_day_micros} (0 = off)</li>
            )}
            {guardrails.ads_auto_apply_mode != null && (
              <li><strong>ads_auto_apply_mode:</strong> {guardrails.ads_auto_apply_mode} (off | negatives_only | budget_decrease_only | low_risk | full)</li>
            )}
            {guardrails.ads_min_readiness_for_full_plan != null && (
              <li><strong>ads_min_readiness_for_full_plan:</strong> {guardrails.ads_min_readiness_for_full_plan}</li>
            )}
            {guardrails.ads_max_target_cpa_change_pct != null && (
              <li><strong>ads_max_target_cpa_change_pct:</strong> {guardrails.ads_max_target_cpa_change_pct}%</li>
            )}
            {guardrails.ads_allow_pause_low_qs_keyword != null && (
              <li><strong>ads_allow_pause_low_qs_keyword:</strong> {guardrails.ads_allow_pause_low_qs_keyword ? "Da" : "Nu"}</li>
            )}
            {guardrails.ads_max_bid_modifier_change_pct != null && (
              <li><strong>ads_max_bid_modifier_change_pct:</strong> {guardrails.ads_max_bid_modifier_change_pct}%</li>
            )}
            {guardrails.ads_hourly_cost_threshold_micros != null && (
              <li><strong>ads_hourly_cost_threshold_micros:</strong> {guardrails.ads_hourly_cost_threshold_micros}</li>
            )}
            {guardrails.ads_network_cost_threshold_micros != null && (
              <li><strong>ads_network_cost_threshold_micros:</strong> {guardrails.ads_network_cost_threshold_micros}</li>
            )}
            {guardrails.ads_allow_disable_search_partners != null && (
              <li><strong>ads_allow_disable_search_partners:</strong> {guardrails.ads_allow_disable_search_partners ? "Da" : "Nu"}</li>
            )}
            {guardrails.ads_allow_pause_keyword != null && (
              <li><strong>ads_allow_pause_keyword:</strong> {guardrails.ads_allow_pause_keyword ? "Da" : "Nu"}</li>
            )}
            {guardrails.traffic_quality_click_session_ratio_threshold != null && (
              <li><strong>traffic_quality_click_session_ratio_threshold:</strong> {guardrails.traffic_quality_click_session_ratio_threshold}</li>
            )}
            {guardrails.traffic_quality_min_sessions != null && (
              <li><strong>traffic_quality_min_sessions:</strong> {guardrails.traffic_quality_min_sessions}</li>
            )}
            {guardrails.ads_primary_objective != null && (
              <li><strong>ads_primary_objective:</strong> {guardrails.ads_primary_objective} (CPC_MIN | CPA_MIN | VOLUME_MAX | ROAS_MAX)</li>
            )}
            {guardrails.ads_search_term_overlap_threshold != null && (
              <li><strong>ads_search_term_overlap_threshold:</strong> {guardrails.ads_search_term_overlap_threshold}</li>
            )}
            {guardrails.ads_click_quality_index_threshold != null && (
              <li><strong>ads_click_quality_index_threshold:</strong> {guardrails.ads_click_quality_index_threshold}</li>
            )}
          </ul>
        </Card>
      )}

      <Card title="Generare plan" description="Un plan pe zi per customer, sau forțează cu checkbox" accent="blue">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={forceNew}
              onChange={(e) => setForceNew(e.target.checked)}
              className="rounded border-slate-300"
            />
            Forțează plan nou (ignoră cache zilnic)
          </label>
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={enqueueingPlan}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {enqueueingPlan ? <i className="ri-loader-4-line animate-spin" /> : null}
            Generate Plan
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </Card>

      <Card title="Plan curent" description="Ultimul plan generat pentru customer-ul selectat" accent="blue">
        {loadingPlan ? (
          <p className="text-sm text-slate-500">Se încarcă…</p>
        ) : !latestPlan ? (
          <p className="text-sm text-slate-500">Niciun plan. Generează un plan mai întâi (și asigură-te că ai snapshots report + conversion_actions).</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">Status:</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${
                latestPlan.status === "queued" ? "bg-amber-100 text-amber-800" :
                latestPlan.status === "applied" ? "bg-emerald-100 text-emerald-800" :
                latestPlan.status === "failed" ? "bg-red-100 text-red-800" :
                "bg-slate-100 text-slate-700"
              }`}>
                {latestPlan.status}
              </span>
              {latestPlan.plan?.planType && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  {latestPlan.plan.planType}
                </span>
              )}
              {latestPlan.plan?.statisticalConfidenceLevel && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${
                  latestPlan.plan.statisticalConfidenceLevel === "high" ? "bg-emerald-100 text-emerald-800" :
                  latestPlan.plan.statisticalConfidenceLevel === "medium" ? "bg-amber-100 text-amber-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  Confidence: {latestPlan.plan.statisticalConfidenceLevel}
                </span>
              )}
              {latestPlan.plan?.deterministicActionsCount != null && (
                <span className="text-slate-600">Deterministic: {latestPlan.plan.deterministicActionsCount}</span>
              )}
              {latestPlan.plan?.biddingStrategyAware === true && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Bidding aware</span>
              )}
              {latestPlan.plan?.cpcReductionMode === true && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">CPC Reduction</span>
              )}
              {latestPlan.plan?.trafficQualityMode === true && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Traffic Quality</span>
              )}
              {latestPlan.plan?.intentMode === true && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Intent</span>
              )}
              {latestPlan.plan?.auctionAware === true && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Auction</span>
              )}
              {latestPlan.plan?.structuralMode === true && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Structural</span>
              )}
              {latestPlan.plan?.primaryObjective && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">{latestPlan.plan.primaryObjective}</span>
              )}
              {(latestPlan.plan?.planVersion === 4 || latestPlan.plan?.planVersion === 5 || latestPlan.plan?.planVersion === 6 || latestPlan.plan?.planVersion === 7 || latestPlan.plan?.planVersion === 8 || latestPlan.plan?.planVersion === 9 || latestPlan.plan?.planVersion === 10 || latestPlan.plan?.planVersion === 10.1) && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">v{latestPlan.plan.planVersion}</span>
              )}
              {latestPlan.plan?.architectureMode === true && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Architecture</span>
              )}
              {latestPlan.plan?.brandIsolationDetected === true && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Brand mixed</span>
              )}
              {latestPlan.plan?.stabilityScore != null && latestPlan.plan.stabilityScore < 1 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800">Stability: {(latestPlan.plan.stabilityScore * 100).toFixed(0)}%</span>
              )}
              {latestPlan.plan?.budgetConcentrationIndex != null && (
                <span className="text-slate-600">BCI: {(latestPlan.plan.budgetConcentrationIndex * 100).toFixed(0)}%</span>
              )}
              {latestPlan.plan?.signalDensityScore != null && latestPlan.plan.signalDensityScore < 1 && (
                <span className="text-slate-600">Signal: {(latestPlan.plan.signalDensityScore * 100).toFixed(0)}%</span>
              )}
              {latestPlan.plan?.conversionSystemMode === true && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Conversion system</span>
              )}
              {latestPlan.plan?.maxAffordableCpa != null && latestPlan.plan.maxAffordableCpa > 0 && (
                <span className="text-slate-600">Max CPA: {latestPlan.plan.maxAffordableCpa.toFixed(2)}</span>
              )}
              {latestPlan.plan?.funnelMetrics && (
                <span className="text-slate-500 text-xs">
                  Funnel: {latestPlan.plan.funnelMetrics.sessions ?? 0}→{latestPlan.plan.funnelMetrics.signups ?? 0}→{latestPlan.plan.funnelMetrics.publishListing ?? 0}
                </span>
              )}
              {latestPlan.plan?.economicMode === true && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-800">Economic</span>
              )}
              {latestPlan.plan?.stabilityMode === true && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Stability</span>
              )}
              {latestPlan.plan?.capitalProtectionActive === true && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">Capital protection</span>
              )}
              {latestPlan.plan?.coolingPeriodActive === true && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">Cooling</span>
              )}
              {latestPlan.plan?.maxSustainableCpa != null && latestPlan.plan.maxSustainableCpa > 0 && (
                <span className="text-slate-600">Max sust. CPA: {latestPlan.plan.maxSustainableCpa.toFixed(2)}</span>
              )}
              {latestPlan.plan?.elasticityScore != null && (
                <span className="text-slate-500">Elast: {latestPlan.plan.elasticityScore}</span>
              )}
              {latestPlan.plan?.clickQualityIndex != null && (
                <span className="text-slate-600">CQI: {latestPlan.plan.clickQualityIndex.toFixed(2)}</span>
              )}
              {latestPlan.plan?.effectiveTargetCpcMicros != null && latestPlan.plan.effectiveTargetCpcMicros > 0 && (
                <span className="text-slate-600">CPC floor: {(latestPlan.plan.effectiveTargetCpcMicros / 1e6).toFixed(2)}</span>
              )}
              {latestPlan.plan?.conversionReadinessScore != null && (
                <span className="text-slate-600">
                  Readiness: {(Number(latestPlan.plan.conversionReadinessScore) * 100).toFixed(0)}%
                </span>
              )}
              <span className="text-slate-500">{new Date(latestPlan.created_at).toLocaleString()}</span>
            </div>
            {latestPlan.plan?.summary && (
              <p className="text-sm text-slate-700">{latestPlan.plan.summary}</p>
            )}
            {Array.isArray(latestPlan.plan?.riskFlags) && latestPlan.plan.riskFlags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700">Risk flags:</p>
                <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
                  {latestPlan.plan.riskFlags.map((f, i) => (
                    <li key={i}>{String(f)}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(latestPlan.plan?.actions) && latestPlan.plan.actions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700">Acțiuni ({latestPlan.plan.actions.length}):</p>
                {latestPlan.plan.deterministicActionsCount != null && latestPlan.plan.deterministicActionsCount > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Deterministic (buget): primele {latestPlan.plan.deterministicActionsCount} · restul: AI (explicații, negativuri, landing)
                  </p>
                )}
                <ul className="mt-2 space-y-2">
                  {latestPlan.plan.actions.map((a, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs">
                      <span className="font-medium text-slate-800">{a.type}</span>
                      {a.autoApplyEligible === true && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Auto-apply</span>
                      )}
                      {a.type === "SUGGEST_LANDING_PAGE_FIX" && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Read-only</span>
                      )}
                      {a.type === "ADJUST_TARGET_CPA" && a.currentTargetCpaMicros != null && a.newTargetCpaMicros != null && (
                        <span className="ml-2 text-slate-600">
                          {Number(a.currentTargetCpaMicros) / 1e6} → {Number(a.newTargetCpaMicros) / 1e6}
                        </span>
                      )}
                      {(a.type === "ADJUST_AD_SCHEDULE" || a.type === "SET_DEVICE_BID_MODIFIER" || a.type === "SET_LOCATION_BID_MODIFIER") && a.currentBidModifier != null && a.newBidModifier != null && (
                        <span className="ml-2 text-slate-600">Bid mod: {a.currentBidModifier} → {a.newBidModifier}</span>
                      )}
                      {a.type === "SUGGEST_AD_COPY_IMPROVEMENT" && a.qualityScore != null && (
                        <span className="ml-2 text-slate-500">QS: {a.qualityScore}</span>
                      )}
                      {a.type === "PAUSE_LOW_QS_KEYWORD" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Guarded</span>
                      )}
                      {a.type === "SUGGEST_DISABLE_SEARCH_PARTNERS" && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Read-only</span>
                      )}
                      {a.type === "APPLY_DISABLE_SEARCH_PARTNERS" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Guarded</span>
                      )}
                      {a.type === "PAUSE_KEYWORD" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Guarded</span>
                      )}
                      {a.type === "SUGGEST_QS_IMPROVEMENT" && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Read-only</span>
                      )}
                      {a.type === "ADJUST_KEYWORD_BID_MODIFIER" && (
                        <span className="ml-2 text-slate-600">
                          {typeof a.currentBidMicros === "number" && typeof a.newBidMicros === "number"
                            ? `${(a.currentBidMicros / 1e6).toFixed(2)} → ${(a.newBidMicros / 1e6).toFixed(2)}`
                            : "Bid modifier"}
                        </span>
                      )}
                      {(a.type === "SUGGEST_NEGATIVE_CROSS_MATCH" || a.type === "SUGGEST_RESTRUCTURE_ADGROUP" || a.type === "SUGGEST_BIDDING_STRATEGY_CHANGE" || a.type === "SUGGEST_SPLIT_BRAND_CAMPAIGN" || a.type === "SUGGEST_BRAND_NEGATIVE_PROTECTION" || a.type === "SUGGEST_SIGNAL_DENSITY_FIX" || a.type === "SUGGEST_LP_RELEVANCE_FIX" || a.type === "SUGGEST_BUDGET_CONSOLIDATION" || a.type === "SUGGEST_FUNNEL_FIX" || a.type === "SUGGEST_MICRO_CONVERSION_TRACKING" || a.type === "SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT" || a.type === "SUGGEST_EXACT_MATCH_EXPANSION" || a.type === "SUGGEST_SCALE_WINDOW" || a.type === "SUGGEST_MARGINAL_CPA_REDUCTION" || a.type === "SUGGEST_BUDGET_CAP") && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Read-only</span>
                      )}
                      {a.type === "SUGGEST_SPLIT_BRAND_CAMPAIGN" && (a.campaignName != null || a.adGroupName != null) ? (
                        <span className="ml-2 text-slate-500">{String(a.campaignName ?? a.adGroupName ?? "")}</span>
                      ) : null}
                      {a.type === "SUGGEST_SIGNAL_DENSITY_FIX" && typeof a.conversions30d === "number" && (
                        <span className="ml-2 text-slate-500">Conv 30d: {a.conversions30d}</span>
                      )}
                      {a.type === "SUGGEST_LP_RELEVANCE_FIX" && (a.keywordText ?? a.ctr != null) && (
                        <span className="ml-2 text-slate-500">{String(a.keywordText ?? "")} {a.ctr != null ? `CTR ${a.ctr}%` : ""} {a.conversionRate != null ? `CvR ${(Number(a.conversionRate) * 100).toFixed(1)}%` : ""}</span>
                      )}
                      {a.type === "SUGGEST_BUDGET_CONSOLIDATION" && typeof a.budgetConcentrationIndex === "number" && (
                        <span className="ml-2 text-slate-500">BCI: {(a.budgetConcentrationIndex * 100).toFixed(0)}%</span>
                      )}
                      {a.type === "SUGGEST_FUNNEL_FIX" && (a.stage ?? a.dropPct != null) && (
                        <span className="ml-2 text-slate-500">{String(a.stage ?? "")} drop {a.dropPct != null ? `${a.dropPct}%` : ""}</span>
                      )}
                      {a.type === "SUGGEST_MICRO_CONVERSION_TRACKING" && typeof a.finalConversions === "number" && (
                        <span className="ml-2 text-slate-500">Final conv: {a.finalConversions}, micro: {a.microEventCount ?? "—"}</span>
                      )}
                      {a.type === "SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT" && (a.campaignId ?? a.keywordCount != null) && (
                        <span className="ml-2 text-slate-500">Keywords: {a.keywordCount ?? "—"}</span>
                      )}
                      {a.type === "SUGGEST_EXACT_MATCH_EXPANSION" && (a.term ?? a.clicks != null) && (
                        <span className="ml-2 text-slate-500">{String(a.term ?? "")} {a.clicks != null ? `clicks ${a.clicks}` : ""}</span>
                      )}
                      {a.type === "SUGGEST_SCALE_WINDOW" && (a.cpa7d != null || a.cpa14d != null) && (
                        <span className="ml-2 text-slate-500">7d CPA {a.cpa7d} &lt; 14d {a.cpa14d}</span>
                      )}
                      {a.type === "SUGGEST_MARGINAL_CPA_REDUCTION" && a.elasticity != null && (
                        <span className="ml-2 text-slate-500">Elasticity: {a.elasticity}</span>
                      )}
                      {a.type === "SUGGEST_BUDGET_CAP" && (a.marginalCpaMicros != null || a.averageCpaMicros != null) && (
                        <span className="ml-2 text-slate-500">Marginal {a.marginalCpaMicros != null ? (a.marginalCpaMicros / 1e6).toFixed(2) : "—"} vs avg {a.averageCpaMicros != null ? (a.averageCpaMicros / 1e6).toFixed(2) : "—"}</span>
                      )}
                      {a.reason && <p className="mt-1 text-slate-600">{a.reason}</p>}
                      {Array.isArray(a.evidence) && a.evidence.length > 0 && (
                        <p className="mt-1 text-slate-500">Evidence: {a.evidence.map((e) => e.term ?? "").filter(Boolean).join(", ")}</p>
                      )}
                      {a.landingPage && <p className="mt-1 text-slate-500">Landing: {String(a.landingPage)} → {String(a.suggestedFix)}</p>}
                    </li>
                  ))}
                </ul>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-slate-500">JSON complet</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">
                    {JSON.stringify(latestPlan.plan.actions, null, 2)}
                  </pre>
                </details>
              </div>
            )}
            {latestPlan.status === "queued" && (
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={enqueueingApply}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                {enqueueingApply ? <i className="ri-loader-4-line animate-spin" /> : null}
                Apply Plan
              </button>
            )}
          </div>
        )}
      </Card>

      <Card title="Istoric planuri" description="Ultimele planuri (refresh manual)" accent="slate">
        {loadingHistory ? (
          <p className="text-sm text-slate-500">Se încarcă…</p>
        ) : plansHistory.length === 0 ? (
          <p className="text-sm text-slate-500">Niciun plan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 pr-4 text-left font-medium text-slate-700">ID (scurt)</th>
                  <th className="pb-2 pr-4 text-left font-medium text-slate-700">Status</th>
                  <th className="pb-2 pr-4 text-left font-medium text-slate-700">Creat</th>
                </tr>
              </thead>
              <tbody>
                {plansHistory.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-slate-600">{p.id.slice(0, 8)}…</td>
                    <td className="py-2 pr-4">{p.status}</td>
                    <td className="py-2 text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          onClick={() => { fetchLatest(); fetchHistory(); }}
          className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-800"
        >
          Refresh
        </button>
      </Card>

      <Card title="Anomaly Status" description="Ultimul eveniment google_ads_anomaly (conversii/CPC/conv rate)" accent="amber">
        {loadingAnomaly ? (
          <p className="text-sm text-slate-500">Se încarcă…</p>
        ) : anomalyEvent ? (
          <div className="space-y-2 text-sm">
            <p className="text-slate-600">
              Detectat la {new Date(anomalyEvent.created_at).toLocaleString()}
              {anomalyEvent.meta?.anomalies && Array.isArray(anomalyEvent.meta.anomalies) && (
                <> · {anomalyEvent.meta.anomalies.length} anomalii</>
              )}
            </p>
            {anomalyEvent.meta?.anomalies && Array.isArray(anomalyEvent.meta.anomalies) && anomalyEvent.meta.anomalies.length > 0 && (
              <ul className="list-inside list-disc text-amber-700">
                {(anomalyEvent.meta.anomalies as Array<{ campaignId?: string; metric?: string; delta?: number }>).slice(0, 10).map((a, i) => (
                  <li key={i}>Campaign {a.campaignId}: {a.metric} (delta: {a.delta != null ? (a.delta * 100).toFixed(0) : "—"}%)</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Niciun eveniment de anomalie. Rulează un check.</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleEnqueueAnomaly}
            disabled={enqueueingAnomaly}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-60"
          >
            {enqueueingAnomaly ? <i className="ri-loader-4-line animate-spin" /> : null}
            Run anomaly check
          </button>
          <button type="button" onClick={fetchAnomalyStatus} className="text-sm text-slate-600 hover:text-slate-800">
            Refresh
          </button>
        </div>
      </Card>

      <Card title="Network Efficiency" description="Search vs Partners vs Display (snapshot: network_performance). Sugestii disable partners / risk DISPLAY_LEAK." accent="blue">
        <p className="text-sm text-slate-600">
          Snapshot-ul network_performance este încărcat la generarea planului v5. Partenerii Search cu spend peste prag și 0 conversii generează SUGGEST_DISABLE_SEARCH_PARTNERS (read-only) sau APPLY_DISABLE_SEARCH_PARTNERS (dacă ads_allow_disable_search_partners). Display pe campanii Search → risk DISPLAY_LEAK.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Match type: snapshot matchtype_performance pentru ADD_NEGATIVE_KEYWORDS evidence-based și opțional PAUSE_KEYWORD (guarded).
        </p>
      </Card>

      <Card title="Traffic Quality Alerts" description="Alerts din comparație Ads clicks vs GA4 sessions (ratio threshold)" accent="blue">
        {loadingTrafficQuality ? (
          <p className="text-sm text-slate-500">Se încarcă…</p>
        ) : trafficQualityAlerts.length === 0 ? (
          <p className="text-sm text-slate-500">Niciun alert. Rulează un check.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {trafficQualityAlerts.slice(0, 10).map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                <span className="text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                {a.meta?.anomalyDays != null && <span className="ml-2 text-amber-700">Anomaly days: {String(a.meta.anomalyDays)}</span>}
                {a.meta?.overallRatio != null && <span className="ml-2 text-slate-600">Ratio: {String(a.meta.overallRatio)}</span>}
                {Array.isArray(a.meta?.suggestedMitigations) && (
                  <p className="mt-1 text-xs text-slate-500">Sugestii: {(a.meta.suggestedMitigations as string[]).join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const token = await getAdminToken();
              if (!token) return;
              setEnqueueingTrafficQuality(true);
              try {
                const res = await fetch("/api/admin/growth/traffic-quality/enqueue", { method: "POST", headers: {} });
                const data = await res.json().catch(() => ({}));
                if (res.ok) setMessage({ type: "success", text: `Traffic quality job: ${data.jobId}. Rulează worker-ul.` });
                else setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
                setTimeout(fetchTrafficQualityAlerts, 2000);
              } finally {
                setEnqueueingTrafficQuality(false);
              }
            }}
            disabled={enqueueingTrafficQuality}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {enqueueingTrafficQuality ? <i className="ri-loader-4-line animate-spin" /> : null}
            Run traffic quality check
          </button>
          <button type="button" onClick={fetchTrafficQualityAlerts} className="text-sm text-slate-600 hover:text-slate-800">
            Refresh
          </button>
        </div>
      </Card>

      <Card title="Auction Pressure" description="Search impression share, rank/budget lost IS, avg CPC. SUGGEST_QS_IMPROVEMENT when rank lost &gt; 30% and QS low; COMPETITION_SPIKE when CPC spike &gt; 25% vs 14d." accent="amber">
        <p className="text-sm text-slate-600">
          Snapshot: <strong>auction_pressure</strong> (campaign + keyword). Budget lost &gt; 30% and CPA good → allow reallocation. Run plan generation to refresh.
        </p>
      </Card>

      <Card title="Intent Mode" description="Heuristic intent scoring (high: preț, licitație, ofertă…; low: poze, definiție…). ADJUST_KEYWORD_BID_MODIFIER ±20%." accent="blue">
        <p className="text-sm text-slate-600">
          Low intent → reduce bid 10–20%. High intent + CPA good → slight increase (clamped). Bid modifiers clamped ±20%.
        </p>
      </Card>

      <Card title="Conversion Lag Protection" description="14-day vs last 3 days conversion trend. CONVERSION_LAG blocks pause and budget decrease." accent="emerald">
        <p className="text-sm text-slate-600">
          If last 3 days drop but 14-day stable → risk flag <strong>CONVERSION_LAG</strong>. Pause and budget decrease actions are blocked when this flag is set.
        </p>
      </Card>

      <Card title="Objective Mode (v7)" description="ads_primary_objective: CPC_MIN | CPA_MIN | VOLUME_MAX | ROAS_MAX" accent="slate">
        <p className="text-sm text-slate-600">
          Optimizer logic branches by objective. CPC_MIN: emphasize CPC reduction; CPA_MIN: emphasize conversion efficiency; VOLUME_MAX / ROAS_MAX: volume or ROAS focus.
        </p>
      </Card>

      <Card title="Click Quality Index (v7)" description="CQI = GA4 sessions / Ads clicks (0–1). Low CQI → prioritize intent cuts and schedule reductions." accent="blue">
        <p className="text-sm text-slate-600">
          If CQI &lt; threshold (ads_click_quality_index_threshold), risk flag <strong>LOW_CLICK_QUALITY</strong> and plan prioritizes intent/schedule actions.
        </p>
      </Card>

      <Card title="Account Architecture (v8)" description="Brand isolation, signal density, LP relevance, BCI, stability. INSTABILITY_HIGH blocks auto-apply." accent="blue">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          <li><strong>Brand isolation:</strong> gobid/gobid.ro mixed with non-brand → SUGGEST_SPLIT_BRAND_CAMPAIGN, SUGGEST_BRAND_NEGATIVE_PROTECTION</li>
          <li><strong>Signal density:</strong> conv 30d &lt; 30 + TARGET_CPA/MAXIMIZE_CONV → SUGGEST_SIGNAL_DENSITY_FIX</li>
          <li><strong>LP relevance:</strong> high CTR + low conv rate → SUGGEST_LP_RELEVANCE_FIX</li>
          <li><strong>BCI:</strong> spend top 20% / total &lt; 0.6 → SUGGEST_BUDGET_CONSOLIDATION</li>
          <li><strong>Stability:</strong> CPC/conv-rate variance high → risk flag INSTABILITY_HIGH; auto-apply blocked next cycle</li>
        </ul>
      </Card>

      <Card title="Conversion System (v9)" description="Funnel leak, micro-conversion, high-intent split, keyword mining, profit zone. CPA_ABOVE_PROFIT_ZONE blocks budget increase." accent="emerald">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          <li><strong>Funnel leak:</strong> GA4 session→signup→publish_listing→paid_boost; stage drop &gt; threshold → SUGGEST_FUNNEL_FIX</li>
          <li><strong>Micro-conversion:</strong> final conv &lt; 30 but micro events exist → SUGGEST_MICRO_CONVERSION_TRACKING</li>
          <li><strong>High-intent split:</strong> high intent + high conv rate keywords → SUGGEST_HIGH_INTENT_CAMPAIGN_SPLIT</li>
          <li><strong>Keyword mining:</strong> search term conv ≥1, clicks &lt; threshold → SUGGEST_EXACT_MATCH_EXPANSION</li>
          <li><strong>Profit:</strong> avg_revenue_per_listing × target_margin = max CPA; campaign CPA above → block increase, risk CPA_ABOVE_PROFIT_ZONE</li>
        </ul>
      </Card>

      <Card title="Stability Mode (v10.1)" description="Conservative scaling, capital protection, cooling period. Max budget +10%, min 7d between budget increases. Auto-apply: negatives and bid/budget decreases only." accent="amber">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          <li><strong>Conservative scaling:</strong> elasticity &gt; 1.2, 7d CPA &lt; 14d CPA, no INSTABILITY_HIGH / CPA_ABOVE_PROFIT_ZONE / CAPITAL_PROTECTION_ACTIVE</li>
          <li><strong>Cooling:</strong> ads_min_days_between_budget_changes = 7, ads_min_days_between_bid_changes = 5; block actions within period</li>
          <li><strong>Stability:</strong> INSTABILITY_HIGH if CV ≥ 0.25</li>
          <li><strong>Capital protection:</strong> 7d CPA &gt; 14d CPA × 1.3 → CAPITAL_PROTECTION_ACTIVE, block scaling 14d</li>
          <li><strong>Auto-apply:</strong> only ADD_NEGATIVE_KEYWORDS and bid/budget decreases</li>
        </ul>
      </Card>

      <Card title="Economic Control (v10)" description="LTV-aware max sustainable CPA, scaling window, budget elasticity, marginal CPA." accent="emerald">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
          <li><strong>LTV:</strong> estimatedLTV = avg_revenue_per_user × (1 + repeat_purchase_rate); maxSustainableCPA = estimatedLTV × target_margin</li>
          <li><strong>Scaling window:</strong> 7d CPA &lt; 14d CPA, conv rate increasing, CPC stable → SUGGEST_SCALE_WINDOW</li>
          <li><strong>Elasticity:</strong> last 14d vs previous 14d; elasticity &gt; 1.2 (v10.1) → allow increase; &lt; 0.5 → SUGGEST_MARGINAL_CPA_REDUCTION</li>
          <li><strong>Marginal CPA:</strong> last 7d vs previous 7d; if marginal CPA ≫ avg → SUGGEST_BUDGET_CAP</li>
        </ul>
      </Card>
      </div>
    </GrowthPageShell>
  );
}
