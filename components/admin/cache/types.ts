export type CacheEvent = {
  id: string;
  type: string;
  target: string | null;
  status: string;
  duration_ms: number | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
  operation_group?: string;
};

export type CacheMetricsData = {
  totalInvalidations: number;
  avgWarmupTimeMs: number | null;
  operationsLast24h: number;
  lastCleanup: { at: string; deletedRows?: number } | null;
} | null;

export const OPERATION_GROUPS = ["tag", "path", "layout", "warmup"] as const;
export const STATUSES = ["ok", "partial", "error"] as const;

export function targetDisplay(target: string | null | undefined): string {
  if (target == null || !target) return "—";
  const m = target.match(/^(?:tag|path|layout|warmup):(.+)$/);
  return m ? m[1] : target;
}

export function targetPrefix(target: string | null | undefined): string {
  if (target == null || !target) return "";
  const m = target.match(/^(tag|path|layout|warmup):/);
  return m ? m[1] : "";
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

export function operationGroupBadgeClass(group: string): string {
  switch (group) {
    case "tag":
      return "bg-sky-100 text-sky-700 border border-sky-200";
    case "path":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "layout":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "warmup":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border border-slate-200";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "ok":
      return "text-emerald-600";
    case "partial":
      return "text-amber-600";
    case "error":
      return "text-red-600";
    default:
      return "text-neutral-600";
  }
}

export function statusBarColor(status: string): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "partial":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-neutral-400";
  }
}

export function durationColor(ms: number | null | undefined): string {
  if (ms == null) return "text-neutral-600";
  if (ms < 500) return "text-emerald-600";
  if (ms <= 2000) return "text-amber-600";
  return "text-red-600";
}
