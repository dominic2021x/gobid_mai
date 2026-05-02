"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface GraphStatus {
  snapshot: { nodes?: number; edges?: number; generatedAt?: string } | null;
  snapshotAt: string | null;
  nodeCount: number;
  edgeCount: number;
  draftRecsCount: number;
  lastRuns: Array<{ type: string; meta?: Record<string, unknown>; at?: string }>;
  topNodes: Array<{ id: string; kind: string; slug: string; label: string; popularity: number }>;
  topEdges: Array<{ id: string; src_node_id: string; dst_node_id: string; rel: string; weight: number }>;
  linkRecs: Array<{ id: string; source_path: string; target_path: string; anchor: string; score: number; status: string }>;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const JOB_TYPES = [
  { type: "semantic_graph_refresh", label: "Refresh graph" },
  { type: "semantic_graph_embeddings_refresh", label: "Refresh embeddings" },
  { type: "semantic_graph_link_recs_refresh", label: "Refresh link recs" },
  { type: "semantic_graph_pages_seed", label: "Seed pages" },
] as const;

export default function GraphPage() {
  const [status, setStatus] = useState<GraphStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/graph/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as GraphStatus);
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
        const res = await fetch("/api/admin/growth/os/graph/enqueue", {
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
          <h1 className="text-xl font-semibold text-slate-900">Semantic Search Graph Engine</h1>
          <p className="mt-1 text-sm text-slate-500">
            Graph nodes/edges from listings, search, GSC. Embeddings, link recommendations, page seeding.
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

      <Card title="Summary" description="Latest snapshot and counts" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !status ? (
          <p className="text-sm text-slate-500">No data. Enqueue Refresh graph and run worker.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-slate-600">
              Nodes: <strong>{status.nodeCount}</strong> · Edges: <strong>{status.edgeCount}</strong> · Draft link recs: <strong>{status.draftRecsCount}</strong>
            </p>
            {status.snapshotAt && (
              <p className="text-slate-500">Snapshot: {new Date(status.snapshotAt).toLocaleString()}</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Last runs" description="Recent job events" accent="slate">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.lastRuns?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No runs yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(status?.lastRuns ?? []).map((r, i) => (
              <li key={i} className="flex gap-2 text-slate-600">
                <span className="font-mono text-xs">{r.type}</span>
                <span>{r.at ? new Date(r.at).toLocaleString() : ""}</span>
                {r.meta && Object.keys(r.meta).length > 0 && <span>{JSON.stringify(r.meta)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Top nodes" description="By popularity" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.topNodes?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No nodes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">kind</th>
                  <th className="p-2 font-medium text-slate-700">slug</th>
                  <th className="p-2 font-medium text-slate-700">label</th>
                  <th className="p-2 font-medium text-slate-700">popularity</th>
                </tr>
              </thead>
              <tbody>
                {(status?.topNodes ?? []).map((n) => (
                  <tr key={n.id} className="border-b border-slate-100">
                    <td className="p-2 text-slate-600">{n.kind}</td>
                    <td className="p-2 font-mono text-slate-800">{n.slug}</td>
                    <td className="p-2 text-slate-800">{n.label}</td>
                    <td className="p-2 text-slate-600">{n.popularity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Top edges" description="By weight" accent="emerald">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.topEdges?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No edges.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">src</th>
                  <th className="p-2 font-medium text-slate-700">dst</th>
                  <th className="p-2 font-medium text-slate-700">rel</th>
                  <th className="p-2 font-medium text-slate-700">weight</th>
                </tr>
              </thead>
              <tbody>
                {(status?.topEdges ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-600 truncate max-w-[120px]" title={e.src_node_id}>{e.src_node_id.slice(0, 8)}…</td>
                    <td className="p-2 font-mono text-slate-600 truncate max-w-[120px]" title={e.dst_node_id}>{e.dst_node_id.slice(0, 8)}…</td>
                    <td className="p-2 text-slate-800">{e.rel}</td>
                    <td className="p-2 text-slate-600">{e.weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Link recommendations" description="source → target, status" accent="amber">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (status?.linkRecs?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No link recs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">source</th>
                  <th className="p-2 font-medium text-slate-700">target</th>
                  <th className="p-2 font-medium text-slate-700">anchor</th>
                  <th className="p-2 font-medium text-slate-700">score</th>
                  <th className="p-2 font-medium text-slate-700">status</th>
                </tr>
              </thead>
              <tbody>
                {(status?.linkRecs ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="p-2 font-mono text-slate-600 max-w-[180px] truncate" title={r.source_path}>{r.source_path}</td>
                    <td className="p-2 font-mono text-slate-600 max-w-[180px] truncate" title={r.target_path}>{r.target_path}</td>
                    <td className="p-2 text-slate-800 max-w-[120px] truncate">{r.anchor}</td>
                    <td className="p-2 text-slate-600">{r.score}</td>
                    <td className="p-2">
                      <span className={"rounded px-1.5 py-0.5 text-xs " + (r.status === "applied" ? "bg-emerald-100 text-emerald-800" : r.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{r.status}</span>
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
