"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";
import GrowthPageShell from "../../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

interface Kpis {
  cpcMicros?: number;
  cpaMicros?: number;
  ctr?: number;
  convRate?: number;
  spend?: number;
  conversions?: number;
}

interface DashboardCampaign {
  id: string;
  name: string;
  status: string;
  biddingStrategyType: string;
  cpc: number;
  cpa: number;
  conversions: number;
  searchRankLostImpressionShare?: number;
  searchBudgetLostImpressionShare?: number;
}

interface DashboardData {
  kpis7d?: Kpis;
  kpis30d?: Kpis;
  campaigns7d?: DashboardCampaign[];
  campaigns30d?: DashboardCampaign[];
  generatedAt?: string;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  amountMicros: number;
  budgetResourceName?: string;
  biddingStrategyType?: string;
  targetCpaMicros?: number;
}

function formatMicros(micros: number | undefined): string {
  if (micros == null || !Number.isFinite(micros)) return "—";
  return (micros / 1_000_000).toFixed(2);
}

function formatPct(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      {sub != null && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function DashboardKpis({
  dashboard,
  loading,
  stale,
  onRefresh,
}: {
  dashboard: DashboardData | null;
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
}) {
  const kpis7 = dashboard?.kpis7d;
  const kpis30 = dashboard?.kpis30d;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">KPIs</h2>
        <div className="flex items-center gap-2">
          {stale && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Stale
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh dashboard"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <KpiCard label="CPC (7d)" value={formatMicros(kpis7?.cpcMicros)} sub="€" />
        <KpiCard label="CPA (7d)" value={formatMicros(kpis7?.cpaMicros)} sub="€" />
        <KpiCard label="CTR (7d)" value={formatPct(kpis7?.ctr)} />
        <KpiCard label="Conv. rate (7d)" value={formatPct(kpis7?.convRate)} />
        <KpiCard label="Spend (7d)" value={kpis7?.spend != null ? `€${kpis7.spend.toFixed(2)}` : "—"} />
        <KpiCard label="Conversions (7d)" value={String(kpis7?.conversions ?? "—")} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <KpiCard label="CPC (30d)" value={formatMicros(kpis30?.cpcMicros)} sub="€" />
        <KpiCard label="CPA (30d)" value={formatMicros(kpis30?.cpaMicros)} sub="€" />
        <KpiCard label="CTR (30d)" value={formatPct(kpis30?.ctr)} />
        <KpiCard label="Conv. rate (30d)" value={formatPct(kpis30?.convRate)} />
        <KpiCard label="Spend (30d)" value={kpis30?.spend != null ? `€${kpis30.spend.toFixed(2)}` : "—"} />
        <KpiCard label="Conversions (30d)" value={String(kpis30?.conversions ?? "—")} />
      </div>
    </div>
  );
}

function CampaignTableFromDashboard({
  campaigns30d,
  campaignsWithActions,
  loading,
  onRefreshCampaigns,
  message,
  onAction,
}: {
  campaigns30d: DashboardCampaign[];
  campaignsWithActions: CampaignRow[];
  loading: boolean;
  onRefreshCampaigns: () => void;
  message: { type: "success" | "error"; text: string } | null;
  onAction: (campaignId: string, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const byId = new Map(campaignsWithActions.map((c) => [c.id, c]));
  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Campaigns (top by spend, 30d)</h2>
        <button
          type="button"
          onClick={onRefreshCampaigns}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh list"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 font-medium text-slate-700">Name</th>
              <th className="px-4 py-2 font-medium text-slate-700">Status</th>
              <th className="px-4 py-2 font-medium text-slate-700">Bidding</th>
              <th className="px-4 py-2 font-medium text-slate-700">CPC (€)</th>
              <th className="px-4 py-2 font-medium text-slate-700">CPA (€)</th>
              <th className="px-4 py-2 font-medium text-slate-700">Conv.</th>
              <th className="px-4 py-2 font-medium text-slate-700">IS lost (rank)</th>
              <th className="px-4 py-2 font-medium text-slate-700">IS lost (budget)</th>
              <th className="px-4 py-2 font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {campaigns30d.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  No dashboard data. Run &quot;Refresh dashboard&quot; (job) and wait for worker.
                </td>
              </tr>
            )}
            {campaigns30d.map((c) => {
              const full = byId.get(c.id);
              return (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-medium text-slate-900">{c.name || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === "ENABLED"
                          ? "bg-emerald-100 text-emerald-800"
                          : c.status === "PAUSED"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.biddingStrategyType || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{formatMicros(c.cpc)}</td>
                  <td className="px-4 py-2 text-slate-600">{formatMicros(c.cpa)}</td>
                  <td className="px-4 py-2 text-slate-600">{c.conversions}</td>
                  <td className="px-4 py-2 text-slate-600">{formatPct(c.searchRankLostImpressionShare)}</td>
                  <td className="px-4 py-2 text-slate-600">{formatPct(c.searchBudgetLostImpressionShare)}</td>
                  <td className="px-4 py-2">
                    {full ? (
                      <CampaignActionsRow
                        campaign={full}
                        onAction={(action, payload) => onAction(c.id, action, payload)}
                      />
                    ) : (
                      <span className="text-slate-400 text-xs">Load list for actions</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignActionsRow({
  campaign,
  onAction,
}: {
  campaign: CampaignRow;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [budgetEur, setBudgetEur] = useState("");
  const [targetCpaEur, setTargetCpaEur] = useState("");

  const handle = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(action);
    try {
      await onAction(action, payload);
    } finally {
      setBusy(null);
    }
  };

  const submitBudget = () => {
    const val = parseFloat(budgetEur);
    if (!Number.isFinite(val) || val < 0 || !campaign.budgetResourceName) return;
    handle("budget", {
      budgetResourceName: campaign.budgetResourceName,
      amountMicros: Math.round(val * 1_000_000),
    });
    setBudgetEur("");
  };

  const submitBidding = () => {
    const val = parseFloat(targetCpaEur);
    if (!Number.isFinite(val) || val < 0) return;
    handle("bidding", { targetCpaMicros: Math.round(val * 1_000_000) });
    setTargetCpaEur("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {campaign.status === "ENABLED" && (
        <button
          type="button"
          onClick={() => handle("pause")}
          disabled={!!busy}
          className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy === "pause" ? "…" : "Pause"}
        </button>
      )}
      {campaign.status === "PAUSED" && (
        <button
          type="button"
          onClick={() => handle("enable")}
          disabled={!!busy}
          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "enable" ? "…" : "Enable"}
        </button>
      )}
      {campaign.budgetResourceName && (
        <span className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Budget €"
            value={budgetEur}
            onChange={(e) => setBudgetEur(e.target.value)}
            className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
          />
          <button
            type="button"
            onClick={submitBudget}
            disabled={!!busy || !budgetEur.trim()}
            className="rounded bg-slate-600 px-2 py-0.5 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Set
          </button>
        </span>
      )}
      {(campaign.biddingStrategyType === "TARGET_CPA" || campaign.targetCpaMicros != null) && (
        <span className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Target CPA €"
            value={targetCpaEur}
            onChange={(e) => setTargetCpaEur(e.target.value)}
            className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
          />
          <button
            type="button"
            onClick={submitBidding}
            disabled={!!busy || !targetCpaEur.trim()}
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Set
          </button>
        </span>
      )}
    </div>
  );
}

function OptimizerSignals({ summary }: { summary: { plan: unknown; digest: unknown; killCampaignIdsCount: number; pilotCampaignIdsCount: number } | null }) {
  const plan = summary?.plan as { summary?: string; planVersion?: number; status?: string; riskFlags?: string[]; stabilityMode?: boolean; capitalProtectionActive?: boolean; coolingPeriodActive?: boolean; actionsCount?: number } | null | undefined;
  const digest = summary?.digest as { date?: string; recentJobRunsCount?: number; latestPlan?: unknown } | undefined;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Optimizer (v10.1)</h2>
      {!summary ? (
        <p className="text-sm text-slate-500">No optimizer data. Run plan and daily digest from Optimizer Ops.</p>
      ) : (
        <>
          {plan?.summary != null && plan.summary !== "" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="text-xs font-medium text-slate-500">Latest plan summary</div>
              <p className="mt-1 text-sm text-slate-800">{plan.summary}</p>
              {plan.planVersion != null && (
                <span className="mt-2 inline-block rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                  v{plan.planVersion} · {plan.status ?? "—"} · {plan.actionsCount ?? 0} actions
                </span>
              )}
            </div>
          ) : plan == null ? (
            <p className="text-sm text-slate-500">No plan yet. Run optimizer plan from Optimizer Ops.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {plan?.riskFlags?.length ? (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs font-medium text-slate-500">Risk flags:</span>
                {plan.riskFlags.map((f) => (
                  <span key={f} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
            {plan?.stabilityMode && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Stability</span>
            )}
            {plan?.capitalProtectionActive && (
              <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">Capital protection</span>
            )}
            {plan?.coolingPeriodActive && (
              <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Cooling</span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Kill campaigns: {summary.killCampaignIdsCount}</span>
            <span>Pilot campaigns: {summary.pilotCampaignIdsCount}</span>
            {digest?.date != null && <span>Last digest: {String(digest.date)}</span>}
            {digest?.recentJobRunsCount != null && <span>Recent job runs: {digest.recentJobRunsCount}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function AiInsightsSection({
  insights,
  loading,
  onRefresh,
}: {
  insights: { topFindings?: string[]; priorities?: string[]; safeNextSteps?: string[]; generatedAt?: string } | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">AI Insights (read-only)</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Enqueuing…" : "Refresh insights"}
        </button>
      </div>
      {!insights ? (
        <p className="text-sm text-slate-500">No insights yet. Click &quot;Refresh insights&quot; to enqueue the job.</p>
      ) : (
        <>
          {insights.generatedAt != null && (
            <p className="text-xs text-slate-500">Generated: {insights.generatedAt}</p>
          )}
          {insights.topFindings?.length ? (
            <div>
              <div className="text-xs font-medium text-slate-500">Top findings</div>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-800">
                {insights.topFindings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {insights.priorities?.length ? (
            <div>
              <div className="text-xs font-medium text-slate-500">Priorities</div>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-800">
                {insights.priorities.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {insights.safeNextSteps?.length ? (
            <div>
              <div className="text-xs font-medium text-slate-500">Safe next steps</div>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-800">
                {insights.safeNextSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function GoogleAdsControlPage() {
  const [dashboard, setDashboard] = useState<{ data: DashboardData | null; stale: boolean }>({ data: null, stale: true });
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardRefreshLoading, setDashboardRefreshLoading] = useState(false);
  const [optimizerSummary, setOptimizerSummary] = useState<{
    plan: unknown;
    digest: unknown;
    killCampaignIdsCount: number;
    pilotCampaignIdsCount: number;
  } | null>(null);
  const [insights, setInsights] = useState<{
    topFindings?: string[];
    priorities?: string[];
    safeNextSteps?: string[];
    generatedAt?: string;
  } | null>(null);
  const [insightsRefreshLoading, setInsightsRefreshLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDashboard = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/dashboard", {
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDashboard({ data: null, stale: true });
        return;
      }
      setDashboard({
        data: (data.dashboard ?? null) as DashboardData | null,
        stale: Boolean(data.stale),
      });
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const fetchOptimizerSummary = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/summary", {
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOptimizerSummary({
          plan: data.plan ?? null,
          digest: data.digest ?? null,
          killCampaignIdsCount: data.killCampaignIdsCount ?? 0,
          pilotCampaignIdsCount: data.pilotCampaignIdsCount ?? 0,
        });
      } else {
        setOptimizerSummary(null);
      }
    } catch {
      setOptimizerSummary(null);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    try {
      const res = await fetch("/api/admin/growth/google/ads/insights/latest", {
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.insights) {
        setInsights(data.insights as typeof insights);
      } else {
        setInsights(null);
      }
    } catch {
      setInsights(null);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setCampaignsLoading(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/campaigns", {
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCampaigns((data.campaigns ?? []) as CampaignRow[]);
      } else {
        setCampaigns([]);
      }
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => {
      if (t) {
        fetchDashboard();
        fetchOptimizerSummary();
        fetchInsights();
        fetchCampaigns();
      }
    });
  }, [fetchDashboard, fetchOptimizerSummary, fetchInsights, fetchCampaigns]);

  const handleRefreshDashboard = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    setDashboardRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/dashboard/enqueue", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data?.error as string) ?? `Error ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Dashboard refresh job enqueued (${data.jobId ?? "ok"}). Run worker to update.` });
      setTimeout(fetchDashboard, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setDashboardRefreshLoading(false);
    }
  }, [fetchDashboard]);

  const handleRefreshInsights = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    setInsightsRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/insights/enqueue", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data?.error as string) ?? `Error ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Insights job enqueued (${data.jobId ?? "ok"}). Run worker to update.` });
      setTimeout(fetchInsights, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setInsightsRefreshLoading(false);
    }
  }, [fetchInsights]);

  const handleAction = useCallback(
    async (campaignId: string, action: string, payload?: Record<string, unknown>) => {
      const token = await getAdminToken();
      if (!token) {
        setMessage({ type: "error", text: "Not authenticated." });
        return;
      }
      const full = campaigns.find((c) => c.id === campaignId);
      if (!full && (action === "budget" || action === "bidding")) {
        setMessage({ type: "error", text: "Campaign not found in list." });
        return;
      }
      let url: string;
      let body: Record<string, unknown>;
      switch (action) {
        case "pause":
          url = "/api/admin/growth/google/ads/campaign/pause";
          body = { campaignId };
          break;
        case "enable":
          url = "/api/admin/growth/google/ads/campaign/enable";
          body = { campaignId };
          break;
        case "budget":
          url = "/api/admin/growth/google/ads/campaign/budget";
          body = {
            campaignId,
            budgetResourceName: payload?.budgetResourceName,
            amountMicros: payload?.amountMicros,
          };
          break;
        case "bidding":
          url = "/api/admin/growth/google/ads/campaign/bidding";
          body = { campaignId, targetCpaMicros: payload?.targetCpaMicros };
          break;
        default:
          return;
      }
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({ type: "error", text: (data?.error as string) ?? `Error ${res.status}` });
          return;
        }
        setMessage({ type: "success", text: `Job enqueued (${data.jobId ?? "ok"}). Run worker to apply.` });
        setTimeout(() => {
          fetchCampaigns();
          fetchDashboard();
        }, 2000);
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      }
    },
    [campaigns, fetchCampaigns, fetchDashboard]
  );

  const campaigns30d = dashboard.data?.campaigns30d ?? [];

  return (
    <GrowthPageShell
      title="Live Control Panel"
      description="Cached dashboard KPIs, campaign table (top by spend), optimizer signals (v10.1), and AI insights. All mutations via jobs + worker."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/growth/google-ads"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
          >
            ← Google Ads
          </Link>
          <Link
            href="/admin/growth/google-ads/optimizer/ops"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-md hover:from-blue-600 hover:to-blue-700"
          >
            Optimizer Ops
          </Link>
        </div>
      }
    >
      <div className="space-y-6">

      <Card title="Dashboard KPIs" description="7d and 30d metrics from cached snapshot" accent="blue">
        <DashboardKpis
          dashboard={dashboard.data}
          loading={dashboardLoading}
          stale={dashboard.stale}
          onRefresh={handleRefreshDashboard}
        />
      </Card>

      <Card title="Campaigns (top by spend)" description="Status, bidding, CPC, CPA, conversions, impression share lost (rank/budget). Actions from campaign list." accent="emerald">
        <CampaignTableFromDashboard
          campaigns30d={campaigns30d}
          campaignsWithActions={campaigns}
          loading={campaignsLoading}
          onRefreshCampaigns={fetchCampaigns}
          message={message}
          onAction={handleAction}
        />
      </Card>

      <Card title="Optimizer signals" description="Latest plan v10.1 summary, risk flags, pilot/kill counts, digest" accent="blue">
        <OptimizerSignals summary={optimizerSummary} />
      </Card>

      <Card title="AI Insights" description="Top findings, priorities, safe next steps (read-only)" accent="amber">
        <AiInsightsSection
          insights={insights}
          loading={insightsRefreshLoading}
          onRefresh={handleRefreshInsights}
        />
      </Card>
      </div>
    </GrowthPageShell>
  );
}
