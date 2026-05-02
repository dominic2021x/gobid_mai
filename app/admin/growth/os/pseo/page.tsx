"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface PageRow {
  slug: string;
  stage: string;
  impressions: number;
  clicks: number;
  ctr: number;
  last_scored_at: string | null;
}

interface StatusData {
  stagedPages: number;
  indexablePages: number;
  maxIndexablePages: number;
  lastRun: string | null;
  pages: PageRow[];
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function PseoPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [demotionLoading, setDemotionLoading] = useState(false);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/status", {
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

  const handleGenerate = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setGenLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/generate", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Generate enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setGenLoading(false);
    }
  }, [fetchStatus]);

  const handleScore = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setScoreLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/score", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Score & promote enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setScoreLoading(false);
    }
  }, [fetchStatus]);

  const handleSeedLinks = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setSeedLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/seed-links", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Seed links enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSeedLoading(false);
    }
  }, [fetchStatus]);

  const handleDemotion = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setDemotionLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/demotion", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Demotion enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setDemotionLoading(false);
    }
  }, [fetchStatus]);

  const handleEnrich = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setEnrichLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/pseo/enrich", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Enrich content enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchStatus, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setEnrichLoading(false);
    }
  }, [fetchStatus]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Programmatic SEO (index budget)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate candidates from keyword clusters, score from GSC, promote to indexable when within budget.
        </p>
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
      <Card title="Index budget status" description="Staged vs indexable vs max" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : status ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-slate-700">Staged pages:</span> {status.stagedPages}
            </p>
            <p>
              <span className="font-medium text-slate-700">Indexable pages:</span> {status.indexablePages}
            </p>
            <p>
              <span className="font-medium text-slate-700">Max allowed:</span> {status.maxIndexablePages}
            </p>
            {status.lastRun && (
              <p className="text-slate-500">Last run: {new Date(status.lastRun).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Could not load status.</p>
        )}
      </Card>
      <Card title="Actions" description="Generate, score, seed links, demotion, enrich" accent="emerald">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={genLoading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {genLoading ? "Enqueuing…" : "Generate candidates"}
          </button>
          <button
            type="button"
            onClick={handleScore}
            disabled={scoreLoading}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {scoreLoading ? "Enqueuing…" : "Score & promote"}
          </button>
          <button
            type="button"
            onClick={handleSeedLinks}
            disabled={seedLoading}
            className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            {seedLoading ? "Enqueuing…" : "Seed internal links"}
          </button>
          <button
            type="button"
            onClick={handleDemotion}
            disabled={demotionLoading}
            className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {demotionLoading ? "Enqueuing…" : "Run demotion check"}
          </button>
          <button
            type="button"
            onClick={handleEnrich}
            disabled={enrichLoading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {enrichLoading ? "Enqueuing…" : "Enrich content"}
          </button>
        </div>
      </Card>
      <Card title="Pages" description="slug, stage, impressions, clicks, ctr, last_scored_at" accent="slate">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : status?.pages?.length === 0 ? (
          <p className="text-sm text-slate-500">No staged/indexable pages. Run Generate candidates (after keyword discovery).</p>
        ) : status?.pages ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 font-medium text-slate-700">slug</th>
                  <th className="p-2 font-medium text-slate-700">stage</th>
                  <th className="p-2 font-medium text-slate-700">impressions</th>
                  <th className="p-2 font-medium text-slate-700">clicks</th>
                  <th className="p-2 font-medium text-slate-700">ctr</th>
                  <th className="p-2 font-medium text-slate-700">last_scored_at</th>
                </tr>
              </thead>
              <tbody>
                {status.pages.map((r) => (
                  <tr key={r.slug} className="border-b border-slate-100">
                    <td className="p-2">
                      <Link href={`/admin/growth/os/landing-pages/${encodeURIComponent(r.slug)}`} className="text-slate-800 hover:underline">
                        {r.slug}
                      </Link>
                    </td>
                    <td className="p-2">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-xs " +
                          (r.stage === "indexable" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")
                        }
                      >
                        {r.stage}
                      </span>
                    </td>
                    <td className="p-2 text-slate-600">{r.impressions}</td>
                    <td className="p-2 text-slate-600">{r.clicks}</td>
                    <td className="p-2 text-slate-600">{(r.ctr * 100).toFixed(2)}%</td>
                    <td className="p-2 text-slate-500">{r.last_scored_at ? new Date(r.last_scored_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No data.</p>
        )}
      </Card>
    </div>
  );
}
