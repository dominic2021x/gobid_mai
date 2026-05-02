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

export default function GrowthOsContentPage() {
  const [briefs, setBriefs] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/latest", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setBriefs(json.contentBriefs ?? null);
      } else {
        setBriefs(null);
      }
    } catch {
      setBriefs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => {
      if (t) fetchLatest();
      else setLoading(false);
    });
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
      const res = await fetch("/api/admin/growth/os/content/enqueue", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Content suggestions enqueued (${json.jobId ?? "ok"}). Run worker.` });
      setTimeout(fetchLatest, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchLatest]);

  const list = (briefs?.briefs as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Content briefs</h1>
        <div className="flex gap-2">
          <Link href="/admin/growth/os/content/items" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Content items</Link>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshLoading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshLoading ? "Enqueuing…" : "Refresh content"}
          </button>
        </div>
      </div>
      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card title="Briefs" description="Type, slug, title/meta ideas, outline, FAQs, internal links" accent="amber">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">No briefs. Run &quot;Refresh content&quot; and worker.</p>
        ) : (
          <ul className="space-y-4 text-sm">
            {list.map((b, i) => (
              <li key={i} className="rounded border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {String(b.type ?? "")}
                  </span>
                  <span className="font-medium text-slate-800">{String(b.slugSuggestion ?? "")}</span>
                </div>
                {Array.isArray(b.titleIdeas) && (b.titleIdeas as string[]).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500">Title ideas</div>
                    <ul className="list-inside list-disc text-slate-700">
                      {(b.titleIdeas as string[]).map((t, j) => (
                        <li key={j}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(b.metaIdeas) && (b.metaIdeas as string[]).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500">Meta ideas</div>
                    <ul className="list-inside list-disc text-slate-700">
                      {(b.metaIdeas as string[]).map((m, j) => (
                        <li key={j}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(b.outline) && (b.outline as string[]).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500">Outline</div>
                    <ul className="list-inside list-disc text-slate-700">
                      {(b.outline as string[]).map((o, j) => (
                        <li key={j}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(b.faqs) && (b.faqs as string[]).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500">FAQs</div>
                    <ul className="list-inside list-disc text-slate-700">
                      {(b.faqs as string[]).map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(b.internalLinks) && (b.internalLinks as string[]).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500">Internal links</div>
                    <p className="text-slate-700">{(b.internalLinks as string[]).join(", ")}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
