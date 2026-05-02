"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface RankedOpportunity {
  page: string;
  query?: string | null;
  score: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface StatusData {
  rankedOpportunities: { opportunities?: RankedOpportunity[]; generatedAt?: string } | null;
  rankedOpportunitiesAt: string | null;
  ctrExperimentsStatus: {
    experiments?: number;
    queued?: number;
    running_a?: number;
    running_b?: number;
    done?: number;
    generatedAt?: string;
  } | null;
  ctrExperimentsStatusAt: string | null;
  hubPages: Array<{ slug: string; status: string; title: string | null; links_json: unknown }>;
  experimentsTotal: number;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function FlywheelPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/flywheel/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as StatusData);
      else setStatus(null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchStatus() : setLoading(false)));
  }, [fetchStatus]);

  const handleRunDaily = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setDailyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/flywheel/run-daily", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: "Daily jobs enqueued (rank + CTR + hubs). Run worker." });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setDailyLoading(false);
    }
  }, [fetchStatus]);

  const handleRunWeekly = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setWeeklyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/flywheel/run-weekly", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: "Weekly prune enqueued. Run worker." });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setWeeklyLoading(false);
    }
  }, [fetchStatus]);

  const opportunities = status?.rankedOpportunities?.opportunities ?? [];
  const ctrStatus = status?.ctrExperimentsStatus;
  const hubs = status?.hubPages ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">SEO Flywheel v1</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ranked opportunities, CTR experiments, hub pages, weekly prune.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRunDaily}
            disabled={dailyLoading}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {dailyLoading ? "Enqueuing…" : "Run daily"}
          </button>
          <button
            type="button"
            onClick={handleRunWeekly}
            disabled={weeklyLoading}
            className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {weeklyLoading ? "Enqueuing…" : "Run weekly"}
          </button>
        </div>
      </div>
      {message && (
        <div
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")
          }
        >
          {message.text}
        </div>
      )}

      <Card title="Ranked opportunities" description="Top pages/queries by score (from GSC + SEO opportunities)" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : opportunities.length === 0 ? (
          <p className="text-sm text-slate-500">No data. Run daily to generate.</p>
        ) : (
          <>
            {status?.rankedOpportunitiesAt && (
              <p className="mb-2 text-xs text-slate-500">Updated: {new Date(status.rankedOpportunitiesAt).toLocaleString()}</p>
            )}
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left sticky top-0 bg-white">
                    <th className="p-2 font-medium text-slate-700">page</th>
                    <th className="p-2 font-medium text-slate-700">query</th>
                    <th className="p-2 font-medium text-slate-700">score</th>
                    <th className="p-2 font-medium text-slate-700">impressions</th>
                    <th className="p-2 font-medium text-slate-700">ctr</th>
                    <th className="p-2 font-medium text-slate-700">position</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.slice(0, 50).map((o, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="p-2 truncate max-w-[200px]" title={o.page}>{o.page}</td>
                      <td className="p-2 truncate max-w-[150px]" title={o.query ?? ""}>{o.query ?? "—"}</td>
                      <td className="p-2 text-slate-600">{o.score}</td>
                      <td className="p-2 text-slate-600">{o.impressions}</td>
                      <td className="p-2 text-slate-600">{(o.ctr * 100).toFixed(2)}%</td>
                      <td className="p-2 text-slate-600">{o.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Showing top 50 of {opportunities.length}</p>
          </>
        )}
      </Card>

      <Card title="CTR experiments status" description="A/B title/meta experiments" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : ctrStatus ? (
          <div className="space-y-2 text-sm">
            <p><span className="font-medium text-slate-700">Total experiments:</span> {status?.experimentsTotal ?? ctrStatus.experiments ?? 0}</p>
            <p><span className="font-medium text-slate-700">Queued:</span> {ctrStatus.queued ?? 0}</p>
            <p><span className="font-medium text-slate-700">Running A:</span> {ctrStatus.running_a ?? 0}</p>
            <p><span className="font-medium text-slate-700">Running B:</span> {ctrStatus.running_b ?? 0}</p>
            <p><span className="font-medium text-slate-700">Done:</span> {ctrStatus.done ?? 0}</p>
            {ctrStatus.generatedAt && (
              <p className="text-slate-500">Updated: {new Date(ctrStatus.generatedAt).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No CTR status. Run daily.</p>
        )}
      </Card>

      <Card title="Hub pages" description="Generated hubs linking to top geo/category pages" accent="slate">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : hubs.length === 0 ? (
          <p className="text-sm text-slate-500">No hub pages. Run daily to generate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">slug</th>
                  <th className="p-2 font-medium text-slate-700">status</th>
                  <th className="p-2 font-medium text-slate-700">title</th>
                  <th className="p-2 font-medium text-slate-700">links</th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((h) => (
                  <tr key={h.slug} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800">{h.slug}</td>
                    <td className="p-2">
                      <span className={"rounded px-1.5 py-0.5 text-xs " + (h.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")}>
                        {h.status}
                      </span>
                    </td>
                    <td className="p-2 text-slate-600">{h.title ?? "—"}</td>
                    <td className="p-2 text-slate-600">{Array.isArray(h.links_json) ? h.links_json.length : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
