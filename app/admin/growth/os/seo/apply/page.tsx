"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../../_components/Card";

interface Patch {
  url: string;
  title: string;
  meta: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SeoApplyPage() {
  const [opportunities, setOpportunities] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applyLoading, setApplyLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/latest", { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setOpportunities(json.seoOpportunities ?? null);
      else setOpportunities(null);
    } catch {
      setOpportunities(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchLatest() : setLoading(false)));
  }, [fetchLatest]);

  const lowCtr = (opportunities?.lowCtrPages as Array<Record<string, unknown>>) ?? [];
  const patches: Patch[] = lowCtr
    .filter((p) => p.page && (p.suggestedTitle || p.suggestedMeta))
    .map((p) => ({
      url: String(p.page ?? ""),
      title: String(p.suggestedTitle ?? ""),
      meta: String(p.suggestedMeta ?? ""),
    }));

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(patches.map((_, i) => i)));
  const selectNone = () => setSelected(new Set());

  const handleApply = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    const toApply = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => patches[i])
      .filter((p) => p.url);
    if (toApply.length === 0) {
      setMessage({ type: "error", text: "Select at least one patch." });
      return;
    }
    setApplyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/seo/apply/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patches: toApply }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Applied ${json.patchCount ?? toApply.length} patches (job ${json.jobId ?? ""}). Run worker.` });
        selectNone();
        setTimeout(fetchLatest, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setApplyLoading(false);
    }
  }, [selected, patches]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os/seo" className="text-sm text-slate-600 hover:text-slate-900">← SEO opportunities</Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">SEO Apply (title/meta overrides)</h1>
        <p className="mt-1 text-sm text-slate-500">Select suggested patches, preview, then confirm to enqueue. Worker will upsert seo_overrides.</p>
      </div>
      {message && (
        <div className={"rounded-lg px-4 py-2 text-sm " + (message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{message.text}</div>
      )}
      <Card title="Patches" description="From low-CTR suggestions" accent="emerald">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : patches.length === 0 ? (
          <p className="text-sm text-slate-500">No patches. Run SEO refresh and ensure low-CTR pages have suggested title/meta.</p>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={selectAll} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Select all</button>
              <button type="button" onClick={selectNone} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Select none</button>
              <span className="text-slate-500 text-xs">{selected.size} selected</span>
            </div>
            <ul className="space-y-2 text-sm">
              {patches.map((p, i) => (
                <li key={i} className="flex items-start gap-2 rounded border border-slate-200 p-2">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800">{p.url}</div>
                    <div className="text-slate-600">Title: {p.title || "—"}</div>
                    <div className="text-slate-600">Meta: {p.meta || "—"}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <button type="button" onClick={handleApply} disabled={applyLoading || selected.size === 0} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {applyLoading ? "Enqueuing…" : "Confirm & enqueue apply"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
