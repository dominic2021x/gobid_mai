"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface LpRow {
  slug: string;
  status: string;
  noindex: boolean;
  updated_at: string;
  created_at?: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function LandingPagesListPage() {
  const [items, setItems] = useState<LpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const fetchItems = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/growth/os/landing-pages?${params}`, {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setItems((json.items ?? []) as LpRow[]);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchItems() : setLoading(false)));
  }, [fetchItems]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Landing pages</h1>
        <p className="mt-1 text-sm text-slate-500">List, edit, and publish. Preview with ?preview=1.</p>
      </div>
      <Card title="Pages" description="Search by slug" accent="blue">
        <div className="mb-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchItems()}
            placeholder="Search by slug…"
            className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={fetchItems}
            className="ml-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No landing pages.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((it) => (
              <li
                key={it.slug}
                className="flex items-center justify-between rounded border border-slate-200 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{it.slug}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {it.status}
                  </span>
                  {it.noindex && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      noindex
                    </span>
                  )}
                  <span className="text-slate-400">{new Date(it.updated_at).toLocaleDateString()}</span>
                </div>
                <Link
                  href={`/admin/growth/os/landing-pages/${encodeURIComponent(it.slug)}`}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
