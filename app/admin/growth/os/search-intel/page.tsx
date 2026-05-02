"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface BucketWeight {
  bucket: string;
  w_lex: number;
  w_sem: number;
  w_graph: number;
  w_fresh: number;
  updated_at: string;
}

interface BoostRow {
  q_norm: string;
  boost: unknown;
  updated_at: string;
}

interface ArmRow {
  arm: string;
  bucket: string;
  impressions: number;
  clicks: number;
  long_clicks: number;
  updated_at: string;
}

interface SearchIntelStatus {
  bucketWeights: BucketWeight[];
  topBoostedQueries: BoostRow[];
  armPerformance: ArmRow[];
  lastRollupAt: string | null;
}

const JOB_TYPES = [
  { type: "search_intel_rollup_hourly", label: "Run rollup (hourly)" },
  { type: "search_intel_rollup_hourly_ips", label: "Run IPS rollup (hourly)" },
  { type: "search_intel_learn_weights_daily", label: "Learn weights (daily)" },
  { type: "search_intel_update_query_boosts_daily", label: "Update query boosts (daily)" },
  { type: "search_personal_rollup_daily", label: "Personal rollup (daily)" },
] as const;

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SearchIntelPage() {
  const [status, setStatus] = useState<SearchIntelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/search-intel/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as SearchIntelStatus);
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

  const handleEnqueue = useCallback(
    async (type: string) => {
      const token = await getAdminToken();
      if (!token) return;
      setEnqueueing(type);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/growth/os/search-intel/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
        else {
          setMessage({ type: "success", text: `Enqueued ${type} (${json.jobId ?? "ok"}). Run worker.` });
          setTimeout(fetchStatus, 2000);
        }
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      } finally {
        setEnqueueing(null);
      }
    },
    [fetchStatus]
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Search Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bucket weights, query boosts, arms. Rollup, learn weights, update boosts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {JOB_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => handleEnqueue(type)}
              disabled={enqueueing !== null}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {enqueueing === type ? "Enqueuing…" : label}
            </button>
          ))}
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

      <Card title="Last rollup" description="Most recent hourly rollup" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <p className="text-sm text-slate-600">
            {status?.lastRollupAt ? new Date(status.lastRollupAt).toLocaleString() : "Never"}
          </p>
        )}
      </Card>

      <Card title="Bucket weights" description="Rerank weights per intent bucket" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.bucketWeights?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No weights. Seed default in DB.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">bucket</th>
                  <th className="p-2 font-medium text-slate-700">w_lex</th>
                  <th className="p-2 font-medium text-slate-700">w_sem</th>
                  <th className="p-2 font-medium text-slate-700">w_graph</th>
                  <th className="p-2 font-medium text-slate-700">w_fresh</th>
                  <th className="p-2 font-medium text-slate-700">updated</th>
                </tr>
              </thead>
              <tbody>
                {(status?.bucketWeights ?? []).map((w) => (
                  <tr key={w.bucket} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800">{w.bucket}</td>
                    <td className="p-2 text-slate-600">{Number(w.w_lex)}</td>
                    <td className="p-2 text-slate-600">{Number(w.w_sem)}</td>
                    <td className="p-2 text-slate-600">{Number(w.w_graph)}</td>
                    <td className="p-2 text-slate-600">{Number(w.w_fresh)}</td>
                    <td className="p-2 text-slate-500">{w.updated_at ? new Date(w.updated_at).toLocaleString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Arm performance" description="Impressions, clicks, long_clicks per arm" accent="emerald">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.armPerformance?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No arms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">arm</th>
                  <th className="p-2 font-medium text-slate-700">bucket</th>
                  <th className="p-2 font-medium text-slate-700">impressions</th>
                  <th className="p-2 font-medium text-slate-700">clicks</th>
                  <th className="p-2 font-medium text-slate-700">long_clicks</th>
                  <th className="p-2 font-medium text-slate-700">updated</th>
                </tr>
              </thead>
              <tbody>
                {(status?.armPerformance ?? []).map((a) => (
                  <tr key={a.arm} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800">{a.arm}</td>
                    <td className="p-2 text-slate-600">{a.bucket}</td>
                    <td className="p-2 text-slate-600">{a.impressions}</td>
                    <td className="p-2 text-slate-600">{a.clicks}</td>
                    <td className="p-2 text-slate-600">{a.long_clicks}</td>
                    <td className="p-2 text-slate-500">{a.updated_at ? new Date(a.updated_at).toLocaleString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Top boosted queries" description="Per-query boosts (clamped 0.8–1.25)" accent="amber">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.topBoostedQueries?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No boosted queries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">q_norm</th>
                  <th className="p-2 font-medium text-slate-700">boost</th>
                  <th className="p-2 font-medium text-slate-700">updated</th>
                </tr>
              </thead>
              <tbody>
                {(status?.topBoostedQueries ?? []).map((b) => (
                  <tr key={b.q_norm} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800 max-w-[200px] truncate" title={b.q_norm}>{b.q_norm}</td>
                    <td className="p-2 text-slate-600 max-w-[180px] truncate" title={JSON.stringify(b.boost)}>{typeof b.boost === "object" ? JSON.stringify(b.boost) : String(b.boost)}</td>
                    <td className="p-2 text-slate-500">{b.updated_at ? new Date(b.updated_at).toLocaleString() : ""}</td>
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
