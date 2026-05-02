"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "../../../../_components/Card";

interface Item {
  id: string;
  type: string;
  status: string;
  title: string | null;
  slug: string | null;
  brief: unknown;
  draft_md: string | null;
  meta_json: unknown;
  created_at: string;
  updated_at: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function ContentItemEditPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftMd, setDraftMd] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth/os/content/items/${id}`, { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setItem(json as Item);
        setDraftMd(json.draft_md ?? "");
        setStatus(json.status ?? "draft");
      } else {
        setItem(null);
      }
    } catch {
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const saveDraft = useCallback(async () => {
    if (!id) return;
    const token = await getAdminToken();
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/growth/os/content/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ draft_md: draftMd }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: "Saved." });
        setItem((prev) => (prev ? { ...prev, draft_md: draftMd } : null));
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSaving(false);
    }
  }, [id, draftMd]);

  const setStatusTo = useCallback(
    async (newStatus: string) => {
      if (!id) return;
      const token = await getAdminToken();
      if (!token) return;
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/growth/os/content/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
        else {
          setStatus(newStatus);
          setItem((prev) => (prev ? { ...prev, status: newStatus } : null));
          setMessage({ type: "success", text: `Status set to ${newStatus}.` });
        }
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  if (!id) return null;
  if (loading) return <div className="p-4 text-slate-500">Loading…</div>;
  if (!item) return <div className="p-4 text-slate-600">Item not found.</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os/content/items" className="text-sm text-slate-600 hover:text-slate-900">← Content items</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">{item.title ?? item.slug ?? item.id}</h1>
        <div className="flex gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.status}</span>
          {item.status !== "published" && <button type="button" onClick={() => setStatusTo("published")} disabled={saving} className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Publish</button>}
          {item.status === "published" && <button type="button" onClick={() => setStatusTo("draft")} disabled={saving} className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">Unpublish</button>}
        </div>
      </div>
      {message && (
        <div className={"rounded-lg px-4 py-2 text-sm " + (message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{message.text}</div>
      )}
      <Card title="Draft markdown" accent="amber">
        <textarea value={draftMd} onChange={(e) => setDraftMd(e.target.value)} className="min-h-[300px] w-full rounded border border-slate-300 p-3 font-mono text-sm" placeholder="Markdown content…" />
        <div className="mt-2">
          <button type="button" onClick={saveDraft} disabled={saving} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button>
        </div>
      </Card>
    </div>
  );
}
