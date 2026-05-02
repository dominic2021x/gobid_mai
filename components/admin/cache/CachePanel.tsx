"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CacheEvent } from "./types";
import { targetDisplay, targetPrefix, formatDuration, operationGroupBadgeClass, durationColor } from "./types";
import CacheControls from "./CacheControls";
import CacheMetrics from "./CacheMetrics";
import SystemHealth from "./SystemHealth";
import CacheTimeline from "./CacheTimeline";
import EventStream from "./EventStream";
import CacheDiagnostics from "./CacheDiagnostics";

type CacheMetricsData = {
  totalInvalidations: number;
  avgWarmupTimeMs: number | null;
  operationsLast24h: number;
  lastCleanup: { at: string; deletedRows?: number } | null;
} | null;

type Props = {
  publicPathsCount?: number;
  layoutSegmentsCount?: number;
};

const POLL_INTERVAL_MS = 3000;

export default function CachePanel({
  publicPathsCount = 0,
  layoutSegmentsCount = 0,
}: Props) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CacheEvent[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheMetricsData>(null);
  const [cacheEnabled, setCacheEnabledState] = useState(false);
  const [togglingCache, setTogglingCache] = useState(false);
  const [cronSecretConfigured, setCronSecretConfigured] = useState<boolean | null>(null);
  const [cronSchedule, setCronSchedule] = useState("Zilnic la 03:00 UTC");
  const [operationGroupFilter, setOperationGroupFilter] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeWindowFilter, setTimeWindowFilter] = useState("");
  const [eventsUnavailableReason, setEventsUnavailableReason] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? "";
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    const eventsUrl = new URL("/api/admin/cache/events", window.location.origin);
    eventsUrl.searchParams.set("limit", "50");
    const [eventsRes, statusRes] = await Promise.all([
      fetch(eventsUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/admin/cache", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    const eventsJson = await eventsRes.json();
    const statusJson = await statusRes.json();
    if (eventsJson?.success && Array.isArray(eventsJson.events)) {
      setEvents(eventsJson.events);
      setEventsUnavailableReason(
        typeof eventsJson.unavailableReason === "string" ? eventsJson.unavailableReason : null
      );
    }
    if (statusJson?.success && statusJson.metrics != null) setCacheMetrics(statusJson.metrics);
    if (statusJson?.success) {
      setCacheEnabledState(statusJson.cacheEnabled === true);
      if (typeof statusJson.cronSecretConfigured === "boolean")
        setCronSecretConfigured(statusJson.cronSecretConfigured);
      if (typeof statusJson.cronSchedule === "string")
        setCronSchedule(statusJson.cronSchedule === "Daily at 03:00 UTC" ? "Zilnic la 03:00 UTC" : statusJson.cronSchedule);
    }
    setEventsLoading(false);
  }, [token]);

  const setCacheEnabled = useCallback(
    async (enabled: boolean) => {
      if (!token) return;
      setTogglingCache(true);
      try {
        const res = await fetch("/api/admin/cache", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "set_cache_enabled", enabled }),
          cache: "no-store",
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          setCacheEnabledState(json.cacheEnabled === true);
          setLastResult(`${new Date().toLocaleTimeString("ro-RO")} • ${json.message ?? ""}`);
        } else {
          setLastResult(`Eroare: ${json?.error ?? "Nu am putut schimba starea cache."}`);
        }
      } catch (e) {
        setLastResult(`Eroare: ${e instanceof Error ? e.message : "Request failed"}`);
      } finally {
        setTogglingCache(false);
      }
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await fetchToken();
      if (cancelled) return;
      setToken(t);
      if (!t) setError("Nu ești autentificat.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchToken]);

  useEffect(() => {
    if (!token) return;
    void fetchData();
    const id = autoRefresh ? setInterval(fetchData, POLL_INTERVAL_MS) : undefined;
    return () => {
      if (id) clearInterval(id);
    };
  }, [token, fetchData, autoRefresh]);

  const liveEvents = events.slice(0, 20);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
        <p className="text-slate-600 font-medium">Se încarcă...</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-8 text-center ring-2 ring-red-100">
        <p className="text-red-700 font-semibold">{error ?? "Lipsă token."}</p>
        <p className="text-sm text-slate-600 mt-2">Autentifică-te în admin pentru a accesa Sistemul Cache.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Switch ON/OFF sistem cache – foarte vizibil */}
      <section className="rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sistem cache</h2>
            <p className="text-sm text-slate-600 mt-1">
              {cacheEnabled
                ? "Pornit – acțiunile de revalidare sunt active."
                : "Oprit – revalidările sunt dezactivate. Pornește cache-ul când ești gata."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cacheEnabled}
            disabled={togglingCache}
            onClick={() => setCacheEnabled(!cacheEnabled)}
            title={cacheEnabled ? "Click pentru a opri cache" : "Click pentru a porni cache"}
            className={`
              relative inline-flex h-10 w-16 flex-shrink-0 cursor-pointer rounded-full border-2 border-slate-300
              transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${cacheEnabled ? "bg-blue-600 border-blue-600" : "bg-slate-300"}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-9 w-9 transform rounded-full bg-white shadow-md ring-0
                transition duration-200
                ${cacheEnabled ? "translate-x-6" : "translate-x-1"}
              `}
            />
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {togglingCache ? "Se salvează..." : "Click pe switch pentru a porni/opri cache-ul."}
        </p>
      </section>

      {lastResult && (
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium shadow-sm">
          ✓ {lastResult}
        </div>
      )}

      {/* System Health */}
      <section>
        <SystemHealth
          serverCacheEnabled={cacheEnabled}
          cdnStatus="active"
          lastCleanup={cacheMetrics?.lastCleanup ?? null}
          cronSecretConfigured={cronSecretConfigured}
          cronSchedule={cronSchedule}
          apiReachable={!!cacheMetrics}
        />
      </section>

      {/* Cache Metrics */}
      <section>
        <CacheMetrics
          totalInvalidations={cacheMetrics?.totalInvalidations ?? 0}
          avgWarmupTimeMs={cacheMetrics?.avgWarmupTimeMs ?? null}
          operationsLast24h={cacheMetrics?.operationsLast24h ?? 0}
          lastCleanup={cacheMetrics?.lastCleanup ?? null}
        />
      </section>

      {/* Recent Operations (Cache Control) */}
      <section>
        <CacheControls
          token={token}
          cacheEnabled={cacheEnabled}
          onSuccess={(msg) => setLastResult(`${new Date().toLocaleTimeString("ro-RO")} • ${msg}`)}
          onError={(msg) => setLastResult(`Eroare: ${msg}`)}
          flushCooldownSec={60}
        />
      </section>

      {/* Performance Timeline */}
      <section>
        <CacheTimeline events={events} />
      </section>

      {eventsUnavailableReason && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <p className="font-medium">Jurnalul evenimentelor nu poate fi citit din baza de date.</p>
          <p className="mt-1 font-mono text-xs opacity-90 break-all">{eventsUnavailableReason}</p>
          <p className="mt-2 text-xs text-amber-800">
            Verifică migrațiile Supabase pentru <code className="rounded bg-amber-100 px-1">cache_events</code> (inclusiv
            coloanele <code className="rounded bg-amber-100 px-1">target</code>, <code className="rounded bg-amber-100 px-1">meta</code>).
          </p>
        </div>
      )}

      {/* Event Stream */}
      <section>
        <EventStream
          events={events}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          operationGroupFilter={operationGroupFilter}
          onOperationGroupFilterChange={setOperationGroupFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          timeWindowFilter={timeWindowFilter}
          onTimeWindowFilterChange={setTimeWindowFilter}
          expandedId={expandedId}
          onExpandedChange={setExpandedId}
          loading={eventsLoading}
        />
      </section>

      {/* Live Log Panel */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">Jurnal live</h2>
            {autoRefresh && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Reîmprospătare (3s)
            </label>
            {!autoRefresh && (
              <button
                type="button"
                onClick={() => {
                  setEventsLoading(true);
                  fetchData();
                }}
                disabled={eventsLoading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Reîmprospătează
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Ora</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Operație</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Țintă</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Durată</th>
              </tr>
            </thead>
            <tbody>
              {eventsLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400 mb-2" />
                    <p className="text-slate-500 text-sm">Se încarcă evenimentele...</p>
                  </td>
                </tr>
              )}
              {!eventsLoading && liveEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-slate-500">
                      <p className="text-sm font-medium">Niciun eveniment încă</p>
                      <p className="text-xs max-w-xs">Rulează „Revalidează cache listări” sau „Forțează warmup” mai sus pentru a genera evenimente.</p>
                    </div>
                  </td>
                </tr>
              )}
              {!eventsLoading &&
                liveEvents.map((e) => {
                  const group = e.operation_group ?? targetPrefix(e.target);
                  return (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 text-xs">
                        {new Date(e.created_at).toLocaleString("ro-RO")}
                      </td>
                      <td className="px-4 py-2.5">
                        {group ? (
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-xs ${operationGroupBadgeClass(group)}`}
                          >
                            {group}
                          </span>
                        ) : null}
                        <span className="ml-1 text-slate-800">{e.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 max-w-[140px] truncate text-xs" title={targetDisplay(e.target)}>
                        {targetDisplay(e.target)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{e.status}</td>
                      <td className={`px-4 py-2.5 tabular-nums text-xs ${durationColor(e.duration_ms)}`} title={e.duration_ms != null ? `${e.duration_ms} ms` : undefined}>
                        {formatDuration(e.duration_ms)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          Ultimele 20 evenimente • Actualizare la fiecare 3s
        </div>
      </section>

      {/* Diagnostics */}
      <section>
        <CacheDiagnostics />
      </section>
    </div>
  );
}
