"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface TrendItem {
  id: string;
  key: string;
  q_norm: string;
  intent: string | null;
  county_slug: string | null;
  category_slug: string | null;
  spike_score: number;
  source_mix: Record<string, unknown>;
  recommended_actions: string[];
  status: string;
  target_slug: string | null;
  created_at?: string;
}

interface StatusData {
  snapshot: { items?: unknown[]; generatedAt?: string } | null;
  snapshotAt: string | null;
  items: TrendItem[];
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function TrendsPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/trends/status", {
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

  const handleRefresh = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/trends/enqueue", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Refresh enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchStatus]);

  const handleApply = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setApplyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/trends/apply", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Apply enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setApplyLoading(false);
    }
  }, [fetchStatus]);

  const handleStatusPatch = useCallback(
    async (id: string, newStatus: "accepted" | "ignored") => {
      const token = await getAdminToken();
      if (!token) return;
      setPatchingId(id);
      try {
        const res = await fetch(`/api/admin/growth/os/trends/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) setTimeout(fetchStatus, 500);
        else {
          const json = await res.json().catch(() => ({}));
          setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
        }
      } finally {
        setPatchingId(null);
      }
    },
    [fetchStatus]
  );

  const items = status?.items ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Marketplace Trend Engine</h1>
          <p className="mt-1 text-sm text-slate-500">
            GSC + internal search growth → spike score. Create LPs, seed links, hub, content.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshLoading}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {refreshLoading ? "Enqueuing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyLoading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {applyLoading ? "Enqueuing…" : "Apply"}
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

      {status?.snapshotAt && (
        <p className="text-sm text-slate-500">Snapshot: {new Date(status.snapshotAt).toLocaleString()}</p>
      )}

      <Card
        title="Trend items"
        description="query, spike score, intent, county, category, actions, status"
        accent="blue"
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No trend items. Run Refresh.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">query</th>
                  <th className="p-2 font-medium text-slate-700">spike</th>
                  <th className="p-2 font-medium text-slate-700">intent</th>
                  <th className="p-2 font-medium text-slate-700">county</th>
                  <th className="p-2 font-medium text-slate-700">category</th>
                  <th className="p-2 font-medium text-slate-700">actions</th>
                  <th className="p-2 font-medium text-slate-700">status</th>
                  <th className="p-2 font-medium text-slate-700">row</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-800 max-w-[180px] truncate" title={o.q_norm}>
                      {o.q_norm}
                    </td>
                    <td className="p-2 text-slate-600">{o.spike_score}</td>
                    <td className="p-2 text-slate-600">{o.intent ?? "—"}</td>
                    <td className="p-2 text-slate-600">{o.county_slug ?? "—"}</td>
                    <td className="p-2 text-slate-600">{o.category_slug ?? "—"}</td>
                    <td className="p-2 text-slate-600">
                      {Array.isArray(o.recommended_actions) ? o.recommended_actions.join(", ") : "—"}
                    </td>
                    <td className="p-2">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-xs " +
                          (o.status === "applied"
                            ? "bg-emerald-100 text-emerald-800"
                            : o.status === "accepted"
                              ? "bg-blue-100 text-blue-800"
                              : o.status === "ignored"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-amber-100 text-amber-800")
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="p-2 flex gap-1 flex-wrap">
                      {(o.status === "new" || o.status === "accepted") && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusPatch(o.id, "accepted")}
                            disabled={patchingId === o.id}
                            className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusPatch(o.id, "ignored")}
                            disabled={patchingId === o.id}
                            className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                          >
                            Ignore
                          </button>
                        </>
                      )}
                      {o.target_slug && (
                        <Link
                          href={`/admin/growth/os/landing-pages/${encodeURIComponent(o.target_slug)}`}
                          className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          LP
                        </Link>
                      )}
                    </td>
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
