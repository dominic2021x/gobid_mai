"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import supabase from "@/lib/supabase";

function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem("darkMode");
    setIsDarkMode(stored === "true");
  }, []);
  const toggle = useCallback(() => {
    setIsDarkMode((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        localStorage.setItem("darkMode", JSON.stringify(next));
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  }, []);
  return { isDarkMode, onToggleDarkMode: toggle };
}

interface NotificationPrefs {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isDarkMode, onToggleDarkMode } = useDarkMode();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const quietStartRef = useRef<HTMLInputElement>(null);
  const quietEndRef = useRef<HTMLInputElement>(null);

  const fetchPrefs = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const res = await dashboardApiFetch("/api/user/notification-prefs", {
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json();
      setPrefs(json.prefs);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  async function handleToggle(field: "push_enabled" | "email_enabled", value: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSaving(true);
    try {
      const res = await dashboardApiFetch("/api/user/notification-prefs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const json = await res.json();
        setPrefs(json.prefs);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleQuietHours(start: string | null, end: string | null) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSaving(true);
    try {
      const res = await dashboardApiFetch("/api/user/notification-prefs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quiet_hours_start: start || null, quiet_hours_end: end || null }),
      });
      if (res.ok) {
        const json = await res.json();
        setPrefs(json.prefs);
      }
    } finally {
      setSaving(false);
    }
  }

  function timeToInput(v: string | null): string {
    if (!v) return "";
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} />
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Notificări
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Gestionează cum primești alertele pentru căutările tale salvate.
        </p>

        {loading && (
          <div className="py-12 text-center text-slate-500">Se încarcă...</div>
        )}

        {!loading && prefs && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
              <h2 className="font-medium text-slate-800 dark:text-slate-100 mb-3">
                Canal livrare
              </h2>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300">
                    Notificări push pe dispozitiv
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.push_enabled}
                    onClick={() => handleToggle("push_enabled", !prefs.push_enabled)}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      prefs.push_enabled
                        ? "bg-orange-500"
                        : "bg-slate-300 dark:bg-slate-600"
                    } ${saving ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        prefs.push_enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300">
                    Email (digest zilnic/săptămânal)
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.email_enabled}
                    onClick={() => handleToggle("email_enabled", !prefs.email_enabled)}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      prefs.email_enabled
                        ? "bg-orange-500"
                        : "bg-slate-300 dark:bg-slate-600"
                    } ${saving ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        prefs.email_enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
              <h2 className="font-medium text-slate-800 dark:text-slate-100 mb-3">
                Ore liniștite (opțional)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Nu trimite notificări push în acest interval.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">De la</span>
                  <input
                    ref={quietStartRef}
                    type="time"
                    defaultValue={timeToInput(prefs.quiet_hours_start)}
                    onBlur={() => {
                      const start = quietStartRef.current?.value || null;
                      const end = quietEndRef.current?.value || null;
                      handleQuietHours(start, end);
                    }}
                    disabled={saving}
                    className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Până la</span>
                  <input
                    ref={quietEndRef}
                    type="time"
                    defaultValue={timeToInput(prefs.quiet_hours_end)}
                    onBlur={() => {
                      const start = quietStartRef.current?.value || null;
                      const end = quietEndRef.current?.value || null;
                      handleQuietHours(start, end);
                    }}
                    disabled={saving}
                    className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard/saved-searches")}
              className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
            >
              ← Căutări salvate
            </button>
          </div>
        )}
      </main>
      <DashboardFooter />
    </div>
  );
}
