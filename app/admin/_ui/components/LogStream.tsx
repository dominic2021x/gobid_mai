"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpsLogEvent {
  id: string;
  type: string;
  created_at: string;
  meta?: Record<string, unknown>;
  correlationId?: string;
  highlight?: boolean;
}

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "search", label: "Search" },
  { key: "ads", label: "Ads" },
  { key: "seo", label: "SEO" },
  { key: "jobs", label: "Jobs" },
  { key: "errors", label: "Errors" },
] as const;

function eventMatchesFilter(event: OpsLogEvent, filter: string): boolean {
  if (filter === "all") return true;
  const t = event.type.toLowerCase();
  if (filter === "search") return t.includes("search");
  if (filter === "ads") return t.includes("ads") || t.includes("optimizer") || t.includes("google_ads");
  if (filter === "seo") return t.includes("seo") || t.includes("pseo") || t.includes("flywheel");
  if (filter === "jobs") return t.includes("job") || t.includes("rollup") || t.includes("refresh") || t.includes("graph") || t.includes("demand") || t.includes("trend");
  if (filter === "errors") return t.includes("_failed") || t.includes("error");
  return true;
}

function formatEventLine(event: OpsLogEvent): string {
  const meta = event.meta ?? {};
  const key = event.type;
  if (key === "ops_toggle") {
    const v = meta.value;
    const k = meta.key ?? "toggle";
    return typeof v === "boolean"
      ? v
        ? `✅ Activated ${k}`
        : `🛑 Deactivated ${k}`
      : (meta.action === "activated" ? "✅ Activated " : "🛑 Deactivated ") + (meta.key ?? key);
  }
  if (key.includes("kill_switch")) {
    const enabled = meta.enabled ?? meta.autoApplyEnabled;
    if (typeof enabled === "boolean") {
      return enabled ? `✅ Activated ${event.type}` : `🛑 Disabled ${event.type}`;
    }
  }
  return event.type;
}

interface LogStreamProps {
  initialEvents?: OpsLogEvent[];
  /** Events to prepend (e.g. from local toggle actions before next poll) */
  prependEvents?: OpsLogEvent[];
  fetchUrl?: string;
  pollIntervalMs?: number;
  maxEvents?: number;
  onCopyCorrelationId?: (id: string) => void;
  /** Auth token for API requests (Bearer) */
  token?: string | null;
  className?: string;
}

export function LogStream({
  initialEvents = [],
  prependEvents = [],
  fetchUrl = "/api/admin/ops/logs",
  pollIntervalMs = 2000,
  maxEvents = 100,
  onCopyCorrelationId,
  token,
  className,
}: LogStreamProps) {
  const [events, setEvents] = useState<OpsLogEvent[]>(initialEvents);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [lastSince, setLastSince] = useState<string | null>(null);

  const fetchLogs = useCallback(async (since?: string) => {
    if (!fetchUrl) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(maxEvents));
      if (since) params.set("since", since);
      const res = await fetch(`${fetchUrl}?${params}`, {
        headers: token ? {} : {},
      });
      if (!res.ok) return;
      const json = await res.json();
      const items = (json.events ?? []) as OpsLogEvent[];
      setEvents((prev) => {
        const merged = [...items];
        const seen = new Set(items.map((e) => e.id));
        for (const e of prev) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            merged.push(e);
          }
        }
        merged.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return merged.slice(0, maxEvents);
      });
      if (items.length > 0) {
        setLastSince(items[0].created_at);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchUrl, maxEvents, token]);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(() => fetchLogs(lastSince ?? undefined), pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchLogs, pollIntervalMs, lastSince]);

  const merged = [
    ...prependEvents.map((e) => ({ ...e, highlight: true })),
    ...events.filter((e) => !prependEvents.some((p) => p.id === e.id)),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const filtered = merged.filter((e) => eventMatchesFilter(e, filter));

  return (
    <div className={cn("rounded-lg border border-[#DADCE0] bg-white shadow-sm", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E8EAED] px-4 py-3">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              filter === chip.key
                ? "bg-[#4285F4] text-white"
                : "bg-white text-[#5F6368] hover:bg-[#E8EAED] border border-[#DADCE0]"
            )}
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="ml-auto flex items-center gap-1 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-sm text-[#5F6368] hover:bg-[#F8F9FA] disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
      <div className="max-h-[400px] overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#5F6368]">
            No events yet
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAED]">
            {filtered.map((event) => {
              const correlationId =
                (event.meta?.correlationId as string) ?? event.correlationId;
              return (
                <div
                  key={event.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-2 transition-colors hover:bg-[#F8F9FA]",
                    event.highlight && "bg-[#FEF7E0]"
                  )}
                >
                  <span className="flex-shrink-0 text-[#5F6368]">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </span>
                  <span className="min-w-0 flex-1 break-all">
                    {formatEventLine(event)}
                  </span>
                  {correlationId && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(correlationId);
                        onCopyCorrelationId?.(correlationId);
                      }}
                      className="flex-shrink-0 rounded p-1 text-[#5F6368] hover:bg-[#E8EAED] hover:text-[#202124]"
                      title="Copy correlation ID"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
