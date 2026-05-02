"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GrowthOsKeywordsPage() {
  const [clusters, setClusters] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/latest", { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setClusters(json.keywordClusters ?? null);
      else setClusters(null);
    } catch {
      setClusters(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchLatest() : setLoading(false)));
  }, [fetchLatest]);

  const handleRefresh = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    setRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/keywords/enqueue", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Keyword discovery enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchLatest, 3000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchLatest]);

  const list = (clusters?.clusters as Array<Record<string, unknown>>) ?? [];
  const [creatingSlug, setCreatingSlug] = useState<string | null>(null);

  const createLandingDraft = useCallback(
    async (c: Record<string, unknown>) => {
      const token = await getAdminToken();
      if (!token) {
        setMessage({ type: "error", text: "Not authenticated." });
        return;
      }
      const mappedUrl = String(c.mappedUrl ?? "").trim();
      const slug = mappedUrl ? mappedUrl.replace(/^https?:\/\/[^/]+(\/ro\/)?/i, "").replace(/\/$/, "").split("/").pop() ?? "" : String(c.label ?? "").toLowerCase().replace(/\s+/g, "-");
      const s = slug || "lp";
      setCreatingSlug(s);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/growth/os/landing-pages/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            slug: s,
            title: String(c.label ?? s),
            h1: String(c.label ?? s),
            filters_json: s ? { categorie: s } : {},
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
        else {
          setMessage({ type: "success", text: `Draft created: ${json.slug}. Edit at landing pages.` });
        }
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      } finally {
        setCreatingSlug(null);
      }
    },
    []
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">← Growth OS</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Keyword clusters</h1>
        <button type="button" onClick={handleRefresh} disabled={refreshLoading} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {refreshLoading ? "Enqueuing…" : "Refresh keywords"}
        </button>
      </div>
      {message && (
        <div className={`rounded-lg px-4 py-2 text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{message.text}</div>
      )}
      <Card title="Clusters" description="Label, intent, keywords, mapped URL" accent="blue">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : list.length === 0 ? <p className="text-sm text-slate-500">No clusters. Run Refresh keywords and worker.</p> : (
          <ul className="space-y-3 text-sm">
            {list.map((c, i) => (
              <li key={i} className="rounded border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{String(c.label ?? "")}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{String(c.intent ?? "")}</span>
                  <span className="text-slate-500">confidence: {Number(c.confidence ?? 0)}</span>
                </div>
                <div className="mt-1 text-slate-600">URL: {String(c.mappedUrl ?? "")}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(c.keywords as string[])?.slice(0, 15).map((kw, j) => (
                    <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{kw}</span>
                  ))}
                  {(c.keywords as string[])?.length > 15 && <span className="text-slate-500">+{(c.keywords as string[]).length - 15} more</span>}
                </div>
                <div className="mt-2">
                  <button type="button" onClick={() => createLandingDraft(c)} disabled={creatingSlug !== null} className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50">
                    {creatingSlug ? "Creating…" : "Create landing page draft"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
