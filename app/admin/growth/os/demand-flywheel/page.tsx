"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface ActionRow {
  id: string;
  type: string;
  status: string;
  q_norm: string | null;
  demand_score: number | null;
  supply_count: number | null;
  created_at: string;
}

interface DemandFlywheelStatus {
  actions: ActionRow[];
  pendingCount: number;
  lastRefreshAt: string | null;
  lastRefreshMeta: Record<string, unknown> | null;
  lastExecuteAt: string | null;
  lastExecuteMeta: Record<string, unknown> | null;
  actionsLast24h?: number;
  actionsByType?: Record<string, { pending: number; executed: number; skipped: number }>;
  successRate?: number | null;
}

const JOB_TYPES = [
  { type: "demand_flywheel_refresh", label: "Refresh (compute actions)" },
  { type: "demand_flywheel_execute", label: "Execute (enqueue jobs)" },
  { type: "demand_flywheel_feedback_eval", label: "Feedback eval (CTR delta)" },
] as const;

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function DemandFlywheelPage() {
  const [status, setStatus] = useState<DemandFlywheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/demand-flywheel/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as DemandFlywheelStatus);
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
        const res = await fetch("/api/admin/growth/os/demand-flywheel/enqueue", {
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
          <h1 className="text-xl font-semibold text-slate-900">Demand → Search → SEO Flywheel</h1>
          <p className="mt-1 text-sm text-slate-500">
            Computes actions from demand/trend/query stats and executes via existing jobs (PSEO, internal links, overrides, content).
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

      <Card title="Summary" description="Last runs, pending count, observability" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !status ? (
          <p className="text-sm text-slate-500">No data.</p>
        ) : (
          <>
            <ul className="space-y-2 text-sm text-slate-700">
              <li>Pending actions: <strong>{status.pendingCount}</strong></li>
              <li>Actions last 24h: <strong>{status.actionsLast24h ?? 0}</strong></li>
              <li>Last refresh: {status.lastRefreshAt ? new Date(status.lastRefreshAt).toLocaleString() : "Never"} {status.lastRefreshMeta?.actionsCreated != null && `(${status.lastRefreshMeta.actionsCreated} created)`}</li>
              <li>Last execute: {status.lastExecuteAt ? new Date(status.lastExecuteAt).toLocaleString() : "Never"} {status.lastExecuteMeta?.executed != null && `(${status.lastExecuteMeta.executed} executed)`}</li>
              <li>Success rate (CTR delta): {status.successRate != null ? `${(status.successRate * 100).toFixed(1)}%` : "—"}</li>
            </ul>
            {status.actionsByType && Object.keys(status.actionsByType).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">By type (24h)</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {Object.entries(status.actionsByType).map(([type, counts]) => (
                    <li key={type}>
                      <span className="font-mono">{type}</span>: P {counts.pending} / E {counts.executed} / S {counts.skipped}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="Actions" description="Last 100 (pending, executed, skipped)" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.actions?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No actions. Run Refresh to compute.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">type</th>
                  <th className="p-2 font-medium text-slate-700">status</th>
                  <th className="p-2 font-medium text-slate-700">q_norm</th>
                  <th className="p-2 font-medium text-slate-700">demand_score</th>
                  <th className="p-2 font-medium text-slate-700">supply_count</th>
                  <th className="p-2 font-medium text-slate-700">created</th>
                </tr>
              </thead>
              <tbody>
                {(status?.actions ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800">{a.type}</td>
                    <td className="p-2">
                      <span className={"rounded px-1.5 py-0.5 text-xs " + (a.status === "pending" ? "bg-amber-100 text-amber-800" : a.status === "executed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}>{a.status}</span>
                    </td>
                    <td className="p-2 font-mono text-slate-600 max-w-[180px] truncate" title={a.q_norm ?? ""}>{a.q_norm ?? "—"}</td>
                    <td className="p-2 text-slate-600">{a.demand_score != null ? a.demand_score : "—"}</td>
                    <td className="p-2 text-slate-600">{a.supply_count != null ? a.supply_count : "—"}</td>
                    <td className="p-2 text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</td>
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
