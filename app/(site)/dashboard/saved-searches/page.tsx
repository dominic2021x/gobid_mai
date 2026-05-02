"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import { getDarkModeFromStorage } from "@/lib/darkMode";

interface SavedSearch {
  id: string;
  q_norm: string;
  filters_json: Record<string, unknown>;
  last_checked_at: string;
  created_at: string;
  delivery_mode?: string | null;
  cooldown_minutes?: number | null;
}

function buildSearchUrl(q: string, filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  params.set("q", q);
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && String(v).trim()) params.set(k, String(v));
  }
  return `/ro?${params.toString()}`;
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => getDarkModeFromStorage());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const res = await dashboardApiFetch("/api/ro/search/saved", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleUpdateDelivery(id: string, deliveryMode: string, cooldownMinutes?: number) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUpdating(id);
    try {
      const body: Record<string, unknown> = { deliveryMode: deliveryMode };
      if (cooldownMinutes != null) body.cooldownMinutes = cooldownMinutes;
      const res = await dashboardApiFetch(`/api/ro/search/saved/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, delivery_mode: deliveryMode, cooldown_minutes: cooldownMinutes ?? x.cooldown_minutes } : x))
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  async function handleDelete(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setDeleting(id);
    try {
      const res = await dashboardApiFetch(`/api/ro/search/saved/${id}`, {
        method: "DELETE",
      });
      if (res.ok) setItems((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode((v) => !v)} />
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-4xl mx-auto w-full">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Căutări salvate
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Vei primi notificări când apar anunțuri noi care se potrivesc căutărilor tale.
        </p>

        {loading && (
          <div className="py-12 text-center text-slate-500">Se încarcă...</div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 p-8 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              Nu ai nicio căutare salvată.
            </p>
            <button
              type="button"
              onClick={() => router.push("/ro")}
              className="mt-4 px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors"
            >
              Caută anunțuri
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="space-y-3">
            {items.map((s) => (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    &quot;{s.q_norm}&quot;
                  </p>
                  {Object.keys(s.filters_json ?? {}).length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Filtre:{" "}
                      {Object.entries(s.filters_json)
                        .filter(([, v]) => v != null && String(v).trim())
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Salvat: {formatDate(s.created_at)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Livrare:</span>
                      <select
                        value={s.delivery_mode ?? "instant"}
                        onChange={(e) => handleUpdateDelivery(s.id, e.target.value)}
                        disabled={updating === s.id}
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="instant">Instant</option>
                        <option value="daily_digest">Zilnic</option>
                        <option value="weekly_digest">Săptămânal</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Cooldown (min):</span>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        defaultValue={s.cooldown_minutes ?? 60}
                        onBlur={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v) && v >= 1 && v <= 1440 && v !== (s.cooldown_minutes ?? 60)) {
                            handleUpdateDelivery(s.id, s.delivery_mode ?? "instant", v);
                          }
                        }}
                        disabled={updating === s.id}
                        className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1 text-xs disabled:opacity-50"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => router.push(buildSearchUrl(s.q_norm, s.filters_json ?? {}))}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Deschide
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                  >
                    {deleting === s.id ? "..." : "Șterge"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
