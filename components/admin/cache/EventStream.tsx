"use client";

import { useMemo, useState, Fragment, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { CacheEvent } from "./types";
import {
  targetDisplay,
  targetPrefix,
  formatDuration,
  operationGroupBadgeClass,
  statusColor,
  durationColor,
  OPERATION_GROUPS,
  STATUSES,
} from "./types";

const ERROR_META_MAX_LEN = 500;
function truncateError(err: unknown): string {
  const s = typeof err === "string" ? err : String(err);
  if (s.length <= ERROR_META_MAX_LEN) return s;
  return s.slice(0, ERROR_META_MAX_LEN) + "…";
}

const TRUNCATE_TARGET_LEN = 40;
function truncateTarget(s: string): string {
  if (s.length <= TRUNCATE_TARGET_LEN) return s;
  return s.slice(0, TRUNCATE_TARGET_LEN) + "…";
}

type Props = {
  events: CacheEvent[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  operationGroupFilter: string;
  onOperationGroupFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  timeWindowFilter: string;
  onTimeWindowFilterChange: (v: string) => void;
  expandedId: string | null;
  onExpandedChange: (id: string | null) => void;
  loading?: boolean;
};

export default function EventStream({
  events,
  searchQuery,
  onSearchChange,
  operationGroupFilter,
  onOperationGroupFilterChange,
  statusFilter,
  onStatusFilterChange,
  timeWindowFilter,
  onTimeWindowFilterChange,
  expandedId,
  onExpandedChange,
  loading = false,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = events;
    if (operationGroupFilter && OPERATION_GROUPS.includes(operationGroupFilter as (typeof OPERATION_GROUPS)[number])) {
      list = list.filter((e) => (e.operation_group ?? targetPrefix(e.target)) === operationGroupFilter);
    }
    if (statusFilter && STATUSES.includes(statusFilter as (typeof STATUSES)[number])) {
      list = list.filter((e) => e.status === statusFilter);
    }
    const now = Date.now();
    if (timeWindowFilter === "1h") {
      const since = now - 60 * 60 * 1000;
      list = list.filter((e) => new Date(e.created_at).getTime() >= since);
    } else if (timeWindowFilter === "6h") {
      const since = now - 6 * 60 * 60 * 1000;
      list = list.filter((e) => new Date(e.created_at).getTime() >= since);
    } else if (timeWindowFilter === "24h") {
      const since = now - 24 * 60 * 60 * 1000;
      list = list.filter((e) => new Date(e.created_at).getTime() >= since);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.type.toLowerCase().includes(q) ||
          (e.target ?? "").toLowerCase().includes(q) ||
          e.status.toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, operationGroupFilter, statusFilter, timeWindowFilter, searchQuery]);

  const copyMeta = useCallback(async (e: CacheEvent) => {
    const json = JSON.stringify(e.meta ?? {}, null, 2);
    await navigator.clipboard.writeText(json);
    setCopiedId(e.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Flux evenimente</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            placeholder="Caută (tip, țintă, status)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm w-48 focus:ring-1 focus:ring-slate-400"
          />
          <select
            value={operationGroupFilter}
            onChange={(e) => onOperationGroupFilterChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Operație: Toate</option>
            {OPERATION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Status: Toate</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={timeWindowFilter}
            onChange={(e) => onTimeWindowFilterChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Timp: Toate</option>
            <option value="1h">Ultima oră</option>
            <option value="6h">Ultimele 6 ore</option>
            <option value="24h">Ultimele 24 ore</option>
          </select>
        </div>
      </div>
      <div className={`overflow-x-auto text-sm ${loading ? "opacity-60 pointer-events-none" : ""}`}>
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="w-8 px-3 py-2.5 font-medium" />
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Ora</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Operație</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Țintă</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Durată</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Detalii</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-slate-500">
                    <p className="text-sm font-medium">
                      {events.length === 0 ? "Niciun eveniment încă" : "Niciun rezultat pentru filtrele selectate"}
                    </p>
                    {events.length === 0 && (
                      <p className="text-xs mt-1">Rulează operații de cache pentru a vedea evenimentele.</p>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((e) => {
              const group = e.operation_group ?? targetPrefix(e.target);
              const hasMeta = e.meta && Object.keys(e.meta).length > 0;
              const hasError = typeof e.meta?.error === "string";
              const isExpanded = expandedId === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    className="border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => hasMeta && onExpandedChange(isExpanded ? null : e.id)}
                  >
                    <td className="px-3 py-2 w-8">
                      {hasMeta ? (
                        <button
                          type="button"
                          className="text-neutral-500 hover:text-neutral-700"
                          aria-expanded={isExpanded}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onExpandedChange(isExpanded ? null : e.id);
                          }}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700" title={new Date(e.created_at).toISOString()}>
                      {new Date(e.created_at).toLocaleString("ro-RO")}
                    </td>
                    <td className="px-3 py-2">
                      {group ? (
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${operationGroupBadgeClass(group)}`}
                        >
                          {group}
                        </span>
                      ) : null}
                      <span className="ml-1 text-slate-900 font-medium">{e.type}</span>
                    </td>
                    <td className="px-3 py-2 text-blue-700 max-w-[180px] font-medium" title={targetDisplay(e.target)}>
                      {truncateTarget(targetDisplay(e.target))}
                    </td>
                    <td className="px-3 py-2">
                      {e.status === "error" ? (
                        <span className={`inline-flex items-center gap-1 font-medium ${statusColor(e.status)}`} title="Eroare">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {e.status}
                        </span>
                      ) : e.status === "partial" ? (
                        <span className={`inline-flex items-center gap-1 font-medium ${statusColor(e.status)}`}>
                          {e.status}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${statusColor(e.status)}`}>
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          {e.status}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 tabular-nums font-medium ${durationColor(e.duration_ms)}`}
                      title={e.duration_ms != null ? `Operația a durat ${e.duration_ms} ms` : undefined}
                    >
                      {formatDuration(e.duration_ms)}
                    </td>
                    <td className="px-3 py-2">
                      {hasMeta && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            copyMeta(e);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                          title="Copiază meta JSON"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedId === e.id ? "Copiat" : "Copiază JSON"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {hasMeta && isExpanded && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={7} className="px-3 py-3 space-y-2">
                        {hasError && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                            <span className="text-xs font-medium text-amber-800">Detalii eroare: </span>
                            <span className="text-xs text-amber-900 break-all">{truncateError(e.meta!.error)}</span>
                          </div>
                        )}
                        <div className="rounded border border-slate-200 bg-white p-2 overflow-x-auto">
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-mono">
                            {JSON.stringify(e.meta, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
