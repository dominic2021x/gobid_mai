"use client";

import { useState, useEffect, useCallback } from "react";

import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Shield, TrendingUp, Activity, CheckCircle2, Clock, Loader2, BarChart3, Layers, RefreshCw } from "lucide-react";
import supabase from "@/lib/supabase";
import JobRunsTable from "./_components/JobRunsTable";

// Palette premium: albastru predominant + accente vibrante
const COLORS = {
  blue: "#2563eb",
  blueLight: "#3b82f6",
  emerald: "#059669",
  amber: "#d97706",
  rose: "#e11d48",
  cyan: "#0891b2",
  slate: "#475569",
};

const links = [
  { href: "/admin/growth/integrations", label: "Integrations", icon: "ri-plug-line", color: "text-blue-600" },
  { href: "/admin/growth/tracking", label: "Tracking", icon: "ri-pie-chart-line", color: "text-emerald-600" },
  { href: "/admin/growth/google-ads", label: "Google Ads", icon: "ri-megaphone-line", color: "text-blue-600" },
  { href: "/admin/growth/ga4", label: "GA4", icon: "ri-bar-chart-box-line", color: "text-amber-600" },
  { href: "/admin/growth/os", label: "Growth OS", icon: "ri-rocket-line", color: "text-rose-600" },
  { href: "/admin/growth/seo/sitemaps", label: "SEO Sitemaps", icon: "ri-map-line", color: "text-blue-600" },
  { href: "/admin/growth/seo/rules", label: "SEO Rules", icon: "ri-code-s-slash-line", color: "text-slate-600" },
  { href: "/admin/growth/jobs", label: "Jobs", icon: "ri-list-check-2", color: "text-emerald-600" },
  { href: "/admin/growth/settings", label: "Settings", icon: "ri-settings-3-line", color: "text-slate-600" },
  { href: "/admin/growth/guardrails", label: "Guardrails", icon: "ri-shield-check-line", color: "text-blue-600" },
];

type OverviewData = {
  kpis: {
    totalRuns: number;
    okRuns: number;
    failedRuns: number;
    successRate: number;
    queuedJobs: number;
  };
  chartData: Array<{ date: string; runs: number; ok: number; failed: number; successRate: number }>;
  biggestChanges: Array<{
    type: string;
    total: number;
    ok: number;
    failed: number;
    successRate: number;
  }>;
};

const DATE_RANGES = [
  { label: "Ultimele 7 zile", days: 7 },
  { label: "Ultimele 30 zile", days: 30 },
  { label: "Ultimele 90 zile", days: 90 },
];

function formatShortDate(s: string) {
  return new Date(s).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
  });
}

export default function GrowthOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(DATE_RANGES[1]);
  const [filterStatus, setFilterStatus] = useState<"all" | "ok" | "failed">("all");

  const fetchOverview = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/growth/overview?days=${dateRange.days}`,
        { headers: {} }
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dateRange.days]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="space-y-6">
        {/* Header premium */}
        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-blue-500 p-6 shadow-xl ring-1 ring-black/5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-60" />
          <div className="relative">
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm md:text-3xl">
              Growth & Performanță
            </h1>
            <p className="mt-1 text-sm text-blue-100/90">
              Vizualizare performanță Google Center, job-uri și metrici.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Shield className="h-3.5 w-3.5" />
              <span>Acces admin</span>
            </div>
          </div>
        </div>

        {/* Filtre – bară colorată */}
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-lg shadow-slate-200/50 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Filtre:</span>
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm transition ${
                  filterStatus === "all"
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white ring-2 ring-blue-300"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Toate
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("ok")}
                className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm transition ${
                  filterStatus === "ok"
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white ring-2 ring-emerald-300"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Success
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("failed")}
                className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm transition ${
                  filterStatus === "failed"
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white ring-2 ring-amber-300"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Eșecuri
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={dateRange.days}
                onChange={(e) => {
                  const days = parseInt(e.target.value, 10);
                  setDateRange(DATE_RANGES.find((r) => r.days === days) ?? DATE_RANGES[1]);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.days} value={r.days}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={fetchOverview}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:from-slate-200 hover:to-slate-300 disabled:opacity-50"
                title="Reîmprospătează"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Reîmprospătează
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards – gradient full color, premium */}
        <section>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-5">Metrici principale</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-600 p-5 shadow-lg shadow-blue-500/25 ring-1 ring-white/20 transition hover:shadow-xl hover:shadow-blue-500/30">
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-blue-100">Rulări</p>
                  <Activity className="h-5 w-5 text-white/90 shrink-0" />
                </div>
                <p className="relative mt-2 text-3xl font-bold text-white tabular-nums">
                  {loading ? <span className="opacity-70">...</span> : (data?.kpis.totalRuns ?? 0).toLocaleString("ro-RO")}
                </p>
                <p className="relative mt-1 text-xs text-blue-100/90 leading-snug">
                  Total job-uri în perioada selectată
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-5 shadow-lg shadow-emerald-500/25 ring-1 ring-white/20 transition hover:shadow-xl hover:shadow-emerald-500/30">
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-emerald-100">Reușite</p>
                  <CheckCircle2 className="h-5 w-5 text-white/90 shrink-0" />
                </div>
                <p className="relative mt-2 text-3xl font-bold text-white tabular-nums">
                  {loading ? <span className="opacity-70">...</span> : (data?.kpis.okRuns ?? 0).toLocaleString("ro-RO")}
                </p>
                <p className="relative mt-1 text-xs text-emerald-100/90 leading-snug">
                  Job-uri finalizate cu succes
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-600 p-5 shadow-lg shadow-blue-500/25 ring-1 ring-white/20 transition hover:shadow-xl hover:shadow-blue-500/30">
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-blue-100">Rată succes</p>
                  <TrendingUp className="h-5 w-5 text-white/90 shrink-0" />
                </div>
                <p className="relative mt-2 text-3xl font-bold text-white tabular-nums">
                  {loading ? <span className="opacity-70">...</span> : `${data?.kpis.successRate ?? 0}%`}
                </p>
                <p className="relative mt-1 text-xs text-blue-100/90 leading-snug">
                  Procent job-uri OK din total
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-5 shadow-lg shadow-amber-500/25 ring-1 ring-white/20 transition hover:shadow-xl hover:shadow-amber-500/30">
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-100">În așteptare</p>
                  <Clock className="h-5 w-5 text-white/90 shrink-0" />
                </div>
                <p className="relative mt-2 text-3xl font-bold text-white tabular-nums">
                  {loading ? <span className="opacity-70">...</span> : (data?.kpis.queuedJobs ?? 0).toLocaleString("ro-RO")}
                </p>
                <p className="relative mt-1 text-xs text-amber-100/90 leading-snug">
                  Job-uri în coadă
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Grafic performanță – premium */}
        <section>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50 px-4 py-2 ring-1 ring-blue-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Evoluție performanță</h2>
                <p className="text-xs text-slate-600">
                  Rulări și rată de succes pe zi.
                </p>
              </div>
            </div>
            {loading ? (
              <div className="flex h-72 items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50/50 to-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              </div>
            ) : data?.chartData?.length ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#c7d2fe" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => formatShortDate(v)}
                      tick={{ fill: COLORS.slate, fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: "#a5b4fc" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: COLORS.slate, fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: "#a5b4fc" }}
                      tickFormatter={(v) => v.toString()}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: COLORS.slate, fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: "#a5b4fc" }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        (name ?? "") === "successRate" ? `${value ?? 0}%` : value ?? 0,
                        (name ?? "") === "runs" ? "Rulări" : (name ?? "") === "ok" ? "OK" : (name ?? "") === "failed" ? "Eșecuri" : "Rată succes",
                      ]}
                      labelFormatter={(v) => formatShortDate(v)}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "2px solid #c7d2fe",
                        borderRadius: "12px",
                        color: "#334155",
                        boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "runs" ? "Rulări" : value === "ok" ? "OK" : value === "failed" ? "Eșecuri" : "Rată succes (%)"
                      }
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="runs"
                      stroke={COLORS.blue}
                      strokeWidth={3}
                      dot={false}
                      name="runs"
                      strokeLinecap="round"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="ok"
                      stroke={COLORS.emerald}
                      strokeWidth={3}
                      dot={false}
                      name="ok"
                      strokeLinecap="round"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="successRate"
                      stroke={COLORS.blue}
                      strokeWidth={3}
                      dot={false}
                      name="successRate"
                      strokeLinecap="round"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 text-slate-500 text-sm font-medium">
                Nu există date pentru perioada selectată
              </div>
            )}
          </div>
        </section>

        {/* Două coloane: Cele mai active tipuri + Module – colorat */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50 px-4 py-2 ring-1 ring-blue-100">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Cele mai active tipuri</h2>
                  <p className="text-xs text-slate-600">Ordonate după număr de rulări.</p>
                </div>
              </div>
              {loading ? (
                <div className="flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : data?.biggestChanges?.length ? (
                <div className="space-y-4">
                  {data.biggestChanges.slice(0, 5).map((item, i) => {
                    const maxTotal = Math.max(...(data.biggestChanges?.map((c) => c.total) ?? [1]), 1);
                    const pct = Math.round((item.total / maxTotal) * 100);
                    const bars = [
                      "from-blue-500 to-blue-600",
                      "from-emerald-500 to-teal-500",
                      "from-blue-500 to-blue-500",
                      "from-amber-500 to-orange-500",
                      "from-rose-500 to-pink-500",
                    ];
                    return (
                      <div key={item.type} className="group">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-semibold text-slate-800">
                            {item.type}
                          </span>
                          <span className="shrink-0 ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {item.total} rulări · {item.successRate}% OK
                          </span>
                        </div>
                        <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${bars[i % bars.length]} shadow-sm transition-all duration-300`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm font-medium text-slate-500 rounded-xl bg-slate-50 border border-slate-200">
                  Nicio activitate în perioada selectată
                </p>
              )}
              <Link
                href="/admin/growth/jobs"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
              >
                TOATE JOB-URILE →
              </Link>
            </div>
          </section>

          <section>
            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 ring-1 ring-emerald-100">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md">
                  <i className="ri-apps-line text-lg" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Module</h2>
                  <p className="text-xs text-slate-600">Integrări și setări Google Center.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {links.slice(0, 6).map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 rounded-xl border-2 border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/50 transition hover:border-blue-300 hover:from-blue-50 hover:to-white hover:shadow-md hover:ring-blue-200"
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.color} bg-white shadow-sm ring-1 ring-slate-200/80`}>
                      <i className={`${item.icon} text-base`} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
              <Link
                href="/admin/growth/integrations"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-700 hover:shadow-lg"
              >
                TOATE MODULELE →
              </Link>
            </div>
          </section>
        </div>

        {/* Tabel ultime rulări – header colorat premium */}
        <section>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/40 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-100 via-slate-50 to-blue-50/80 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-500 text-white shadow-lg">
                  <i className="ri-list-check-2 text-xl" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Ultimele rulări job-uri</h2>
                  <p className="text-xs text-slate-600">
                    Istoric execuții. OK = succes, Eroare = eșec.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white">
              <JobRunsTable limit={20} theme="slate" />
            </div>
            <div className="border-t border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/80 px-5 py-2.5 text-xs font-medium text-slate-500">
              Ultimele 20 rulări • Reîmprospătare manuală
            </div>
          </div>
        </section>
    </div>
  );
}
