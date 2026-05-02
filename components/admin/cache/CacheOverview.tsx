"use client";

import { Activity, Server, Globe } from "lucide-react";

type Status = "active" | "degraded" | "inactive";

type Props = {
  serverCacheEnabled: boolean;
  cdnStatus: "active" | "degraded" | "inactive";
  estimatedKeys?: number;
  lastInvalidation?: string | null;
  avgTtfbMs?: number | null;
  /** When null/undefined, hit rate is not measured (not shown). */
  hitRate?: number | null;
  /** When null/undefined, edge hit rate is not shown. */
  edgeHitRate?: number | null;
  publicPathsCount?: number;
  layoutSegmentsCount?: number;
};

function statusColor(s: Status): string {
  switch (s) {
    case "active":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "degraded":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    default:
      return "bg-red-500/15 text-red-600 border-red-500/30";
  }
}

export default function CacheOverview({
  serverCacheEnabled,
  cdnStatus,
  estimatedKeys = 0,
  lastInvalidation,
  avgTtfbMs,
  hitRate,
  edgeHitRate,
  publicPathsCount = 0,
  layoutSegmentsCount = 0,
}: Props) {
  const serverStatus: Status = serverCacheEnabled ? "active" : "inactive";
  const cdnStatusTyped: Status = cdnStatus;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-3">
          <Server className="h-5 w-5" />
          <span className="text-sm font-medium">Server Cache</span>
        </div>
        <p className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${statusColor(serverStatus)}`}>
          Status: {serverStatus === "active" ? "ACTIVE" : "INACTIVE"}
        </p>
        {hitRate != null ? (
          <p className="mt-2 text-sm text-gray-600">
            Hit Rate: <span className="font-semibold">{hitRate}%</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Hit rate: — (nemăsurat)</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-3">
          <Globe className="h-5 w-5" />
          <span className="text-sm font-medium">CDN Cache</span>
        </div>
        <p className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${statusColor(cdnStatusTyped)}`}>
          Status: {cdnStatusTyped === "active" ? "ACTIVE" : cdnStatusTyped === "degraded" ? "DEGRADED" : "INACTIVE"}
        </p>
        {edgeHitRate != null ? (
          <p className="mt-2 text-sm text-gray-600">
            Edge Hits: <span className="font-semibold">{edgeHitRate}%</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Edge hits: — (nemăsurat)</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
        <div className="flex items-center gap-2 text-gray-500 mb-3">
          <Activity className="h-5 w-5" />
          <span className="text-sm font-medium">Overview</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Estimated keys</p>
            <p className="font-mono font-semibold text-gray-900">{estimatedKeys}</p>
          </div>
          <div>
            <p className="text-gray-500">Last invalidation</p>
            <p className="font-mono text-gray-900">{lastInvalidation ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Avg TTFB</p>
            <p className="font-mono font-semibold text-gray-900">{avgTtfbMs != null ? `${avgTtfbMs} ms` : "—"}</p>
          </div>
          {(publicPathsCount > 0 || layoutSegmentsCount > 0) && (
            <div>
              <p className="text-gray-500">Coverage</p>
              <p className="font-mono text-gray-900">
                {publicPathsCount} paths, {layoutSegmentsCount} segments
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
