"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface LinkRow {
  id: string;
  source_url: string;
  target_url: string;
  anchor: string;
  status: string;
  created_at: string;
  updated_at: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function InternalLinksPage() {
  const [items, setItems] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItems = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/internal-links?limit=300", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setItems((json.items ?? []) as LinkRow[]);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchItems() : setLoading(false)));
  }, [fetchItems]);

  const handleGenerate = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setGenLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/internal-links/generate", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Generate enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchItems, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setGenLoading(false);
    }
  }, [fetchItems]);

  const handleApply = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setApplyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/internal-links/apply", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Apply enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchItems, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setApplyLoading(false);
    }
  }, [fetchItems]);

  const handleRemove = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setMessage({ type: "error", text: "Select at least one row." });
      return;
    }
    const token = await getAdminToken();
    if (!token) return;
    setRemoveLoading(true);
    setMessage(null);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/growth/os/internal-links/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: "removed" }),
          })
        )
      );
      setMessage({ type: "success", text: `Marked ${ids.length} as removed.` });
      setSelected(new Set());
      fetchItems();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRemoveLoading(false);
    }
  }, [selected, fetchItems]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Internal linking</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate from SEO internal_link_plan snapshot, apply drafts, or remove. Applied links show in &quot;Resurse utile&quot; on LP and /ro.
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
      <Card title="Actions" description="Generate (from snapshot) or apply draft links" accent="emerald">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={genLoading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {genLoading ? "Enqueuing…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyLoading}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {applyLoading ? "Enqueuing…" : "Apply"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removeLoading || selected.size === 0}
            className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {removeLoading ? "Updating…" : "Remove selected"}
          </button>
        </div>
      </Card>
      <Card title="Links" description="source, target, anchor, status" accent="slate">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No links. Run SEO refresh, then Generate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="p-2 w-8" />
                  <th className="p-2 font-medium text-slate-700">source</th>
                  <th className="p-2 font-medium text-slate-700">target</th>
                  <th className="p-2 font-medium text-slate-700">anchor</th>
                  <th className="p-2 font-medium text-slate-700">status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="p-2">
                      {it.status !== "removed" && (
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggle(it.id)}
                        />
                      )}
                    </td>
                    <td className="p-2 text-slate-600">{it.source_url}</td>
                    <td className="p-2 text-slate-600">{it.target_url}</td>
                    <td className="p-2 text-slate-800">{it.anchor}</td>
                    <td className="p-2">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-xs " +
                          (it.status === "applied"
                            ? "bg-emerald-100 text-emerald-800"
                            : it.status === "draft"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600")
                        }
                      >
                        {it.status}
                      </span>
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
