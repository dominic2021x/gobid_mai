"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../../_components/Card";

interface Item {
  id: string;
  type: string;
  status: string;
  title: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function ContentItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/content/items", { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setItems((json.items ?? []) as Item[]);
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os/content" className="text-sm text-slate-600 hover:text-slate-900">← Content briefs</Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Content items</h1>
        <p className="mt-1 text-sm text-slate-500">Editorial workflow: edit markdown, publish or unpublish.</p>
      </div>
      <Card title="Items" description="List of content items" accent="amber">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? <p className="text-sm text-slate-500">No items.</p> : (
          <ul className="space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
                <div>
                  <span className="font-medium text-slate-800">{it.title ?? it.slug ?? it.id}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{it.status}</span>
                </div>
                <Link href={`/admin/growth/os/content/items/${it.id}`} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Edit</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
