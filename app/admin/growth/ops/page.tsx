"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Shield,
  Settings,
  TrendingUp,
  Search,
  Cpu,
  Rocket,
  Megaphone,
} from "lucide-react";
import {
  SwitchField,
  LogStream,
  ChartCard,
} from "@/app/admin/_ui/components";
import GrowthPageShell from "../_components/GrowthPageShell";
import GrowthKpiCard from "../_components/GrowthKpiCard";
import type { OpsLogEvent } from "@/app/admin/_ui/components";
import {
  evaluateMetric,
  type ThresholdRule,
} from "@/lib/admin/thresholds";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type KpiVariant = "blue" | "red" | "yellow" | "green" | "grey" | "white";
function statusToVariant(level: "good" | "warn" | "bad" | "neutral" | undefined): KpiVariant {
  if (level === "good") return "green";
  if (level === "warn") return "yellow";
  if (level === "bad") return "red";
  return "grey";
}
import supabase from "@/lib/supabase";

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const THRESHOLDS = {
  latencyMs: {
    good: { lte: 200 },
    warn: { gte: 201, lte: 500 },
    bad: { gte: 501 },
    badGuidance: "Optimize search pipeline or enable more aggressive caching",
  } as ThresholdRule,
  cacheHitRatio: {
    good: { gte: 0.6 },
    warn: { gte: 0.3, lte: 0.59 },
    bad: { lte: 0.29 },
    badGuidance: "Warm cache or increase TTL for frequent queries",
  } as ThresholdRule,
  candidateCount: {
    good: [10, 200],
    warn: [5, 9],
    bad: [0, 4],
    badGuidance: "Check index health and retrieval configuration",
  } as ThresholdRule,
  queuedJobs: {
    good: { lte: 10 },
    warn: { gte: 11, lte: 50 },
    bad: { gte: 51 },
    badGuidance: "Scale worker or investigate stuck jobs",
  } as ThresholdRule,
};

export default function OpsConsolePage() {
  const [token, setToken] = useState<string | null>(null);
  const [kpis, setKpis] = useState<{
    searchHealth: { latencyMs: number; cacheHitRatio: number; candidateCount: number } | null;
    worker: { queuedJobs: number; lastRunAt: string | null; lastRunOk: boolean | null };
    growthOs: { lastDailyPackAt: string | null };
    flywheel: { lastRunAt: string | null };
    adsOptimizer: {
      stabilityModeActive: boolean;
      coolingPeriodActive: boolean;
      capitalProtectionActive: boolean;
      lastDigestAt: string | null;
      lastPlanAt: string | null;
    } | null;
    charts: {
      latency7d: Array<{ date: string; value: number }> | null;
      cacheHitRatio7d: Array<{ date: string; value: number }> | null;
      jobsQueueTrend: Array<{ date: string; value: number }> | null;
    };
  } | null>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [prependLogEvents, setPrependLogEvents] = useState<OpsLogEvent[]>([]);

  const fetchToken = useCallback(async () => {
    const t = await getToken();
    setToken(t);
    return t;
  }, []);

  const fetchKpis = useCallback(async () => {
    const t = await fetchToken();
    if (!t) return;
    try {
      const res = await fetch("/api/admin/ops/kpis", {
      });
      if (res.ok) {
        const json = await res.json();
        setKpis(json);
      }
    } catch {
      // ignore
    }
  }, [fetchToken]);

  const fetchSettings = useCallback(async () => {
    const t = await fetchToken();
    if (!t) return;
    try {
      const res = await fetch("/api/admin/growth/settings", {
      });
      if (res.ok) {
        const json = await res.json();
        const s = json.settings ?? {};
        const map: Record<string, boolean> = {};
        for (const key of [
          "ads_optimizer_enabled",
          "ads_optimizer_auto_apply_enabled",
          "growth_os_enabled",
          "pseo_enabled",
        ]) {
          const entry = s[key];
          const v = entry?.value ?? entry;
          map[key] =
            v === true || v === "true" || v === "1" || (typeof v === "object" && v?.value === true);
        }
        setSettings(map);
      }
    } catch {
      // ignore
    }
  }, [fetchToken]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchToken();
      await Promise.all([fetchKpis(), fetchSettings()]);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [fetchToken, fetchKpis, fetchSettings]);

  const handleToggle = useCallback(
    (key: string) => async (checked: boolean) => {
      if (!token) return null;
      try {
        const res = await fetch(`/api/admin/ops/toggles/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: checked }),
        });
        const json = await res.json();
        if (res.ok) {
          setSettings((prev) => ({ ...prev, [key]: json.value }));
          setPrependLogEvents((prev) => [
            {
              id: `local-${Date.now()}-${key}`,
              type: "ops_toggle",
              created_at: new Date().toISOString(),
              meta: { key, value: json.value, action: json.value ? "activated" : "deactivated" },
              highlight: true,
            } as OpsLogEvent,
            ...prev.slice(0, 4),
          ]);
          return { value: json.value, eventId: json.eventId };
        }
        return null;
      } catch {
        return null;
      }
    },
    [token]
  );

  const latResult = kpis?.searchHealth
    ? evaluateMetric(kpis.searchHealth.latencyMs, THRESHOLDS.latencyMs)
    : null;
  const cacheResult = kpis?.searchHealth
    ? evaluateMetric(kpis.searchHealth.cacheHitRatio, THRESHOLDS.cacheHitRatio)
    : null;
  const candResult = kpis?.searchHealth
    ? evaluateMetric(kpis.searchHealth.candidateCount, THRESHOLDS.candidateCount)
    : null;
  const queueResult = kpis?.worker
    ? evaluateMetric(kpis.worker.queuedJobs, THRESHOLDS.queuedJobs)
    : null;

  if (loading) {
    return (
      <GrowthPageShell title="Ops Console" description="System health, controls, and live operations">
        <div className="flex min-h-[400px] items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#4285F4]" />
        </div>
      </GrowthPageShell>
    );
  }

  return (
    <GrowthPageShell title="Ops Console" description="System health, controls, and live operations">
      <div className="space-y-6">
        {/* Row A: System Health KPIs - Google Ads style colored cards */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#202124]">
            <Shield className="h-4 w-4 text-[#4285F4]" />
            System Health
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GrowthKpiCard
              title="Search latency (ms)"
              value={kpis?.searchHealth?.latencyMs ?? "—"}
              variant={statusToVariant(latResult?.level)}
              hint={latResult?.hint}
              icon={<Search className="h-5 w-5" />}
            />
            <GrowthKpiCard
              title="Cache hit ratio"
              value={
                kpis?.searchHealth?.cacheHitRatio != null
                  ? `${Math.round(kpis.searchHealth.cacheHitRatio * 100)}%`
                  : "—"
              }
              variant={statusToVariant(cacheResult?.level)}
              hint={cacheResult?.hint}
              icon={<Search className="h-5 w-5" />}
            />
            <GrowthKpiCard
              title="Candidates"
              value={kpis?.searchHealth?.candidateCount ?? "—"}
              variant={statusToVariant(candResult?.level)}
              hint={candResult?.hint}
              icon={<Search className="h-5 w-5" />}
            />
            <GrowthKpiCard
              title="Queued jobs"
              value={kpis?.worker?.queuedJobs ?? "—"}
              variant={statusToVariant(queueResult?.level)}
              hint={queueResult?.hint}
              icon={<Cpu className="h-5 w-5" />}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GrowthKpiCard
              title="Last worker run"
              value={
                kpis?.worker?.lastRunAt
                  ? new Date(kpis.worker.lastRunAt).toLocaleString()
                  : "Never"
              }
              variant={kpis?.worker?.lastRunOk === false ? "red" : "white"}
              icon={<Cpu className="h-5 w-5 text-[#5F6368]" />}
            />
            <GrowthKpiCard
              title="Growth OS pack"
              value={
                kpis?.growthOs?.lastDailyPackAt
                  ? new Date(kpis.growthOs.lastDailyPackAt).toLocaleString()
                  : "Never"
              }
              variant="white"
              icon={<Rocket className="h-5 w-5 text-[#5F6368]" />}
            />
            <GrowthKpiCard
              title="Flywheel last run"
              value={
                kpis?.flywheel?.lastRunAt
                  ? new Date(kpis.flywheel.lastRunAt).toLocaleString()
                  : "Never"
              }
              variant="white"
              icon={<Rocket className="h-5 w-5 text-[#5F6368]" />}
            />
            <GrowthKpiCard
              title="Ads optimizer"
              value={kpis?.adsOptimizer?.stabilityModeActive ? "Stability on" : "Normal"}
              variant={
                kpis?.adsOptimizer?.coolingPeriodActive || kpis?.adsOptimizer?.capitalProtectionActive
                  ? "yellow"
                  : "white"
              }
              hint={
                kpis?.adsOptimizer?.lastDigestAt
                  ? `Digest: ${new Date(kpis.adsOptimizer.lastDigestAt).toLocaleString()}`
                  : undefined
              }
              icon={<Megaphone className="h-5 w-5 text-[#5F6368]" />}
            />
          </div>
        </section>

        {/* Row B: Controls */}
        <section className="rounded-lg border border-[#DADCE0] bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#202124]">
            <Settings className="h-4 w-4 text-[#4285F4]" />
            Controls
          </h2>
          <p className="mb-4 text-sm text-[#5F6368]">Feature toggles and operational switches</p>
        <div className="space-y-4">
          <SwitchField
            label="Ads Optimizer enabled"
            description="Master switch for the ads optimization pipeline"
            checked={settings.ads_optimizer_enabled ?? true}
            onToggle={handleToggle("ads_optimizer_enabled")}
            warning="Disabling stops all optimizer plans from being applied"
          />
          <SwitchField
            label="Ads Optimizer auto-apply"
            description="Automatically apply generated plans without manual approval"
            checked={settings.ads_optimizer_auto_apply_enabled ?? true}
            onToggle={handleToggle("ads_optimizer_auto_apply_enabled")}
            warning="Disable for manual review before each apply"
          />
          <SwitchField
            label="Growth OS enabled"
            description="Enable daily Growth OS pack and related jobs"
            checked={settings.growth_os_enabled ?? true}
            onToggle={handleToggle("growth_os_enabled")}
          />
          <SwitchField
            label="PSEO enabled"
            description="Enable programmatic SEO generation and scoring"
            checked={settings.pseo_enabled ?? true}
            onToggle={handleToggle("pseo_enabled")}
          />
        </div>
        </section>

        {/* Row C: Charts */}
        <section className="rounded-lg border border-[#DADCE0] bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#202124]">
            <TrendingUp className="h-4 w-4 text-[#4285F4]" />
            Trends
          </h2>
          <p className="mb-4 text-sm text-[#5F6368]">7-day latency, cache hit ratio, and job queue</p>
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard
            title="Search latency (7d)"
            description="Average latency per day (ms)"
          >
            {kpis?.charts?.latency7d?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpis.charts.latency7d}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <YAxis tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <Tooltip
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "1px solid #DADCE0",
                      backgroundColor: "white",
                    }}
                    formatter={(v) => [typeof v === "number" ? v : 0, "ms"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#4285F4"
                    strokeWidth={2}
                    dot={{ fill: "#4285F4", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#5F6368]">
                No data
              </div>
            )}
          </ChartCard>
          <ChartCard
            title="Cache hit ratio (7d)"
            description="Percentage of cache hits per day"
          >
            {kpis?.charts?.cacheHitRatio7d?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpis.charts.cacheHitRatio7d}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <YAxis tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <Tooltip
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "1px solid #DADCE0",
                      backgroundColor: "white",
                    }}
                    formatter={(v) => [typeof v === "number" ? v : 0, "%"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#34A853"
                    strokeWidth={2}
                    dot={{ fill: "#34A853", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#5F6368]">
                No data
              </div>
            )}
          </ChartCard>
          <ChartCard
            title="Job runs (24h)"
            description="Runs per hour"
          >
            {kpis?.charts?.jobsQueueTrend?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpis.charts.jobsQueueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <YAxis tick={{ fontSize: 11, fill: "#5F6368" }} stroke="#DADCE0" />
                  <Tooltip
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "1px solid #DADCE0",
                      backgroundColor: "white",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#EA4335"
                    strokeWidth={2}
                    dot={{ fill: "#EA4335", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#5F6368]">
                No data
              </div>
            )}
          </ChartCard>
        </div>
        </section>

        {/* Row D: Live Ops Log */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#202124]">
            <Activity className="h-4 w-4 text-[#4285F4]" />
            Live Ops Log
          </h2>
          <p className="mb-4 text-sm text-[#5F6368]">Recent growth events (poll every 2s)</p>
        <LogStream
          fetchUrl="/api/admin/ops/logs"
          pollIntervalMs={2000}
          maxEvents={100}
          token={token}
          prependEvents={prependLogEvents}
        />
        </section>
      </div>
    </GrowthPageShell>
  );
}
