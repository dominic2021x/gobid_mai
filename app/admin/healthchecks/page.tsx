"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import ModernDatePicker from "@/components/ModernDatePicker";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";

interface HealthcheckRun {
  id: number;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  now_ro: string | null;
  ok: boolean;
  total: number;
  failed: number;
  env: string | null;
  version: string | null;
  source?: string;
}

interface HealthcheckSettings {
  auto_enabled: boolean;
  window_start_time: string;
  window_end_time: string;
  postpone_minutes_min: number;
  postpone_minutes_max: number;
  load_threshold_ms: number;
  schedule_days: string;
  updated_at: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

function todayRo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Bucharest" });
}

function yesterdayRo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Bucharest" });
}

const DEFAULT_SETTINGS: HealthcheckSettings = {
  auto_enabled: false,
  window_start_time: "03:00",
  window_end_time: "05:00",
  postpone_minutes_min: 20,
  postpone_minutes_max: 40,
  load_threshold_ms: 4000,
  schedule_days: "1,3,5",
  updated_at: null,
};

const DAY_LABELS: { value: number; label: string }[] = [
  { value: 0, label: "Dum" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Joi" },
  { value: 5, label: "Vin" },
  { value: 6, label: "Sâm" },
];

export default function AdminHealthchecksPage() {
  const [runs, setRuns] = useState<HealthcheckRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<HealthcheckSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerErrorDetail, setTriggerErrorDetail] = useState<string | null>(null);

  const [activeUsers, setActiveUsers] = useState<{ last5Min: number; last15Min: number; updatedAt: string | null }>({ last5Min: 0, last15Min: 0, updatedAt: null });
  const [activeUsersLoading, setActiveUsersLoading] = useState(false);

  const fetchActiveUsers = useCallback(async () => {
    setActiveUsersLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/healthchecks/active-users", {
      });
      if (res.ok) {
        const data = await res.json();
        setActiveUsers({
          last5Min: data.last5Min ?? 0,
          last15Min: data.last15Min ?? 0,
          updatedAt: data.updatedAt ?? null,
        });
      }
    } catch {
      // ignore
    } finally {
      setActiveUsersLoading(false);
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Nu ești autentificat.");
        return;
      }
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("perPage", String(perPage));
      if (onlyFailed) params.set("onlyFailed", "true");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(`/api/admin/healthchecks/runs?${params}`, {
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Eroare ${res.status}`);
        return;
      }
      const j = await res.json();
      setRuns(j.runs ?? []);
      setTotal(j.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, onlyFailed, fromDate, toDate]);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/healthchecks/settings", {
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          auto_enabled: !!data.auto_enabled,
          window_start_time: data.window_start_time ?? "03:00",
          window_end_time: data.window_end_time ?? "05:00",
          postpone_minutes_min: data.postpone_minutes_min ?? 20,
          postpone_minutes_max: data.postpone_minutes_max ?? 40,
          load_threshold_ms: data.load_threshold_ms ?? 4000,
          schedule_days: data.schedule_days ?? "1,3,5",
          updated_at: data.updated_at ?? null,
        });
      }
    } catch {
      // keep defaults
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchActiveUsers();
    const t = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(t);
  }, [fetchActiveUsers]);

  const handleTriggerScan = async () => {
    setTriggering(true);
    setTriggerError(null);
    setTriggerErrorDetail(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setTriggerError("Nu ești autentificat.");
        return;
      }
      const res = await fetch("/api/admin/healthchecks/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ skipLoadCheck: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.busy) {
        setTriggerError(
          data.suggestion || `Trafic ridicat. Încercați din nou în ${data.retryAfterMin ?? 30} minute.`
        );
        setTriggerErrorDetail(data.detail ?? null);
        return;
      }
      if (!res.ok) {
        setTriggerError(data.error || `Eroare ${res.status}`);
        setTriggerErrorDetail(null);
        return;
      }
      setTriggerErrorDetail(null);
      setSuccess(`Scanare finalizată. ${data.failed === 0 ? "Toate verificările au trecut." : `${data.failed} verificări eșuate.`}`);
      setTriggerError(null);
      setTriggerErrorDetail(null);
      fetchRuns();
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : "Eroare la scanare");
    } finally {
      setTriggering(false);
    }
  };

  const handleToggleAuto = async (checked: boolean) => {
    const prev = settings.auto_enabled;
    setSettings((s) => ({ ...s, auto_enabled: checked }));
    setSettingsSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSettings((s) => ({ ...s, auto_enabled: prev }));
        return;
      }
      const res = await fetch("/api/admin/healthchecks/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ auto_enabled: checked }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSettings((s) => ({ ...s, auto_enabled: !!data.auto_enabled }));
      } else {
        setSettings((s) => ({ ...s, auto_enabled: prev }));
        setError(data?.error || "Nu s-a putut salva. Verificați că migrarea healthcheck_settings a fost rulată în Supabase.");
      }
    } catch (e) {
      setSettings((s) => ({ ...s, auto_enabled: prev }));
      setError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveWindow = async () => {
    setSettingsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/healthchecks/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          window_start_time: settings.window_start_time,
          window_end_time: settings.window_end_time,
          load_threshold_ms: settings.load_threshold_ms,
          postpone_minutes_min: settings.postpone_minutes_min,
          postpone_minutes_max: settings.postpone_minutes_max,
          schedule_days: settings.schedule_days,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          auto_enabled: !!data.auto_enabled,
          window_start_time: data.window_start_time ?? "03:00",
          window_end_time: data.window_end_time ?? "05:00",
          postpone_minutes_min: data.postpone_minutes_min ?? 20,
          postpone_minutes_max: data.postpone_minutes_max ?? 40,
          load_threshold_ms: data.load_threshold_ms ?? 4000,
          schedule_days: data.schedule_days ?? "1,3,5",
          updated_at: data.updated_at ?? null,
        });
        setSuccess("Setări salvate.");
        setTimeout(() => setSuccess(null), 3000);
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const today = todayRo();
  const yesterday = yesterdayRo();
  const runsToday = runs.filter((r) => r.run_date === today);
  const runsYesterday = runs.filter((r) => r.run_date === yesterday);
  const lastSuccessful = runs.find((r) => r.ok);
  const lastFailed = runs.find((r) => !r.ok);

  const scheduleDaysSet = new Set(
    (settings.schedule_days || "1,3,5")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
  );

  const toggleScheduleDay = (day: number) => {
    const next = new Set(scheduleDaysSet);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSettings((s) => ({ ...s, schedule_days: Array.from(next).sort((a, b) => a - b).join(",") }));
  };

  function getNextScheduledRun(): string {
    if (!settings.auto_enabled || scheduleDaysSet.size === 0) return "—";
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour12: false });
    for (let d = 0; d < 8; d++) {
      const next = new Date(now);
      next.setDate(next.getDate() + d);
      const inRo = next.toLocaleString("en-US", { timeZone: "Europe/Bucharest" });
      const dayOfWeek = new Date(inRo).getDay();
      if (scheduleDaysSet.has(dayOfWeek)) {
        const label = formatter.format(next);
        return d === 0 ? `Azi (${label}), ~03:00` : label + ", ~03:00";
      }
    }
    return "—";
  }

  const filteredRuns = search.trim()
    ? runs.filter(
        (r) =>
          String(r.run_date).toLowerCase().includes(search.toLowerCase()) ||
          String(r.env).toLowerCase().includes(search.toLowerCase()) ||
          String(r.version || "").toLowerCase().includes(search.toLowerCase()) ||
          String(r.source || "").toLowerCase().includes(search.toLowerCase())
      )
    : runs;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Scanare automată a sănătății site-ului</h1>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2">
            <i className="ri-error-warning-line text-xl" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 flex items-center gap-2">
            <i className="ri-checkbox-circle-line text-xl" />
            {success}
          </div>
        )}
        {triggerError && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            <div className="flex items-center gap-2">
              <i className="ri-time-line text-xl flex-shrink-0" />
              <span>{triggerError}</span>
            </div>
            {triggerErrorDetail && (
              <p className="mt-2 text-sm text-amber-700 pl-8">{triggerErrorDetail}</p>
            )}
          </div>
        )}

        {/* Utilizatori activi */}
        <section className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <i className="ri-user-heart-line" />
              Utilizatori activi
            </h2>
            {activeUsers.updatedAt && (
              <span className="text-xs text-gray-500">
                Actualizat: {new Date(activeUsers.updatedAt).toLocaleTimeString("ro-RO", { timeStyle: "short" })}
              </span>
            )}
          </div>
          <div className="p-6 flex flex-wrap gap-6">
            <div className="flex items-baseline gap-2">
              {activeUsersLoading ? (
                <span className="text-gray-400 flex items-center gap-1">
                  <i className="ri-loader-4-line animate-spin" /> Se încarcă...
                </span>
              ) : (
                <>
                  <span className="text-3xl font-bold text-gray-900">{activeUsers.last5Min}</span>
                  <span className="text-sm text-gray-500">utilizatori activi (ultimele 5 min)</span>
                </>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              {activeUsersLoading ? null : (
                <>
                  <span className="text-2xl font-semibold text-gray-700">{activeUsers.last15Min}</span>
                  <span className="text-sm text-gray-500">ultimele 15 min</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={fetchActiveUsers}
              disabled={activeUsersLoading}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              Reîmprospătează
            </button>
          </div>
          <p className="px-6 pb-4 text-xs text-gray-500">
            Scanarea este amânată doar dacă sunt mai mult de 10 utilizatori activi și răspunsul site-ului depășește pragul, sau dacă site-ul răspunde cu eroare. Cu puțini utilizatori activi (ex. 2), scanarea poate rula.
          </p>
        </section>

        {/* Control scanare */}
        <section className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/80">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <i className="ri-settings-3-line" />
              Control scanare
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleTriggerScan}
                disabled={triggering}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {triggering ? (
                  <>
                    <i className="ri-loader-4-line animate-spin text-lg" />
                    Se scanează...
                  </>
                ) : (
                  <>
                    <i className="ri-scan-line text-lg" />
                    Scanează acum
                  </>
                )}
              </button>
              <p className="text-sm text-gray-500">
                Verifică încărcarea site-ului înainte de scanare. Dacă traficul e ridicat, scanarea este amânată automat (20–40 min).
              </p>
            </div>

            <div className="h-px bg-gray-100" />

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_enabled}
                    onChange={(e) => handleToggleAuto(e.target.checked)}
                    disabled={settingsLoading || settingsSaving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  <span className="ms-3 text-sm font-medium text-gray-700">Scanare automată (cron la 03:00 București)</span>
                </label>
                {settingsSaving && <span className="text-xs text-gray-500">Se salvează...</span>}
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Program: în ce zile să ruleze (0 = Duminică, 6 = Sâmbătă)</p>
                <div className="flex flex-wrap gap-3 mb-2">
                  {DAY_LABELS.map(({ value, label }) => (
                    <label key={value} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleDaysSet.has(value)}
                        onChange={() => toggleScheduleDay(value)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-gray-600">
                  <strong>Următoarea scanare programată:</strong> {getNextScheduledRun()}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Între orele (fereastră preferată)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={settings.window_start_time}
                      onChange={(e) => setSettings((s) => ({ ...s, window_start_time: e.target.value }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <span className="text-gray-500">–</span>
                    <input
                      type="time"
                      value={settings.window_end_time}
                      onChange={(e) => setSettings((s) => ({ ...s, window_end_time: e.target.value }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prag răspuns (ms) – peste acest timp = trafic ridicat</label>
                  <input
                    type="number"
                    min={2000}
                    max={15000}
                    step={500}
                    value={settings.load_threshold_ms}
                    onChange={(e) => setSettings((s) => ({ ...s, load_threshold_ms: parseInt(e.target.value, 10) || 4000 }))}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm w-28"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveWindow}
                    disabled={settingsSaving}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    {settingsSaving ? "Se salvează..." : "Salvează setări"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Amânare la trafic ridicat: {settings.postpone_minutes_min}–{settings.postpone_minutes_max} minute. Cron-ul rulează zilnic la 03:00 (București); dacă automatizarea e activă și în fereastră, se verifică încărcarea înainte de scanare.
              </p>
            </div>
          </div>
        </section>

        {/* Rezumat */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Rezumat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Astăzi</p>
              <p className="text-xl font-semibold text-gray-900">
                {runsToday.length ? (runsToday.every((r) => r.ok) ? "OK" : `${runsToday.filter((r) => !r.ok).length} eșuate`) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Ieri</p>
              <p className="text-xl font-semibold text-gray-900">
                {runsYesterday.length ? (runsYesterday.every((r) => r.ok) ? "OK" : `${runsYesterday.filter((r) => !r.ok).length} eșuate`) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Ultima rulare reușită</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {lastSuccessful ? formatDate(lastSuccessful.started_at) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Ultima rulare eșuată</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {lastFailed ? formatDate(lastFailed.started_at) : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Filtre și tabel */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/80">
            <h2 className="text-lg font-semibold text-gray-800">Istoric rulări</h2>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyFailed}
                  onChange={(e) => setOnlyFailed(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Doar rulări cu erori</span>
              </label>
              <ModernDatePicker value={fromDate} onChange={setFromDate} placeholder="De la" isDarkMode={false} />
              <ModernDatePicker value={toDate} onChange={setToDate} placeholder="Până la" isDarkMode={false} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută run_date, env, version, sursă..."
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm w-56"
              />
            </div>

            {loading ? (
              <p className="text-gray-500 py-8 flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin" />
                Se încarcă...
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left p-3 font-medium text-gray-700">Data</th>
                        <th className="text-left p-3 font-medium text-gray-700">Început</th>
                        <th className="text-left p-3 font-medium text-gray-700">Sursă</th>
                        <th className="text-left p-3 font-medium text-gray-700">Status</th>
                        <th className="text-left p-3 font-medium text-gray-700">Eșuate / Total</th>
                        <th className="text-left p-3 font-medium text-gray-700">Acțiuni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="p-3">{r.run_date}</td>
                          <td className="p-3">{formatDate(r.started_at)}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.source === "manual" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>
                              {r.source === "manual" ? "Manual" : "Cron"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={r.ok ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                              {r.ok ? "OK" : "Eșuat"}
                            </span>
                          </td>
                          <td className="p-3">
                            {r.failed} / {r.total}
                          </td>
                          <td className="p-3">
                            <Link
                              href={`/admin/healthchecks/${r.id}`}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              Detalii
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <WheelPaginationFooter isDarkMode={false} className="mt-4">
                  <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-500">
                      Total {total} rulări {search ? `(filtrat: ${filteredRuns.length})` : ""}
                    </p>
                    <WheelPagination
                      totalPages={Math.max(1, Math.ceil(total / perPage))}
                      currentPage={page}
                      onPageChange={(p) => setPage(p)}
                      canGoNext={page * perPage < total}
                      isDarkMode={false}
                    />
                  </div>
                </WheelPaginationFooter>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
