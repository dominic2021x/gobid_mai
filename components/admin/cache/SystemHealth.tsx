"use client";

import { Activity, AlertTriangle, Cloud, Server, Trash2, Plug } from "lucide-react";

const CLEANUP_WARN_AGE_MS = 48 * 60 * 60 * 1000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
  if (hours >= 1) return `acum ${hours} ${hours === 1 ? "oră" : "ore"}`;
  if (mins >= 1) return `acum ${mins} ${mins === 1 ? "minut" : "minute"}`;
  return "acum puțin";
}

type HealthItem = {
  icon: React.ReactNode;
  label: string;
  status: "ACTIVE" | "HEALTHY" | "DEGRADED" | "INACTIVE" | "WARNING";
  explanation: string;
  statusClass: string;
};

type Props = {
  serverCacheEnabled?: boolean;
  cdnStatus?: "active" | "degraded" | "inactive";
  lastCleanup: { at: string; deletedRows?: number } | null;
  cronSecretConfigured: boolean | null;
  cronSchedule: string;
  apiReachable?: boolean;
};

export default function SystemHealth({
  serverCacheEnabled = true,
  cdnStatus = "active",
  lastCleanup,
  cronSecretConfigured,
  cronSchedule,
  apiReachable = true,
}: Props) {
  const cleanupStale =
    lastCleanup && Date.now() - new Date(lastCleanup.at).getTime() > CLEANUP_WARN_AGE_MS;
  const cronStatus = !lastCleanup
    ? ("INACTIVE" as const)
    : cleanupStale
      ? ("WARNING" as const)
      : ("HEALTHY" as const);

  const serverItem: HealthItem = {
    icon: <Server className="h-5 w-5" />,
    label: "Cache server",
    status: serverCacheEnabled ? "ACTIVE" : "INACTIVE",
    explanation: serverCacheEnabled
      ? "Strat unstable_cache activ pentru listări /ro"
      : "Stratul de cache server nu e activ",
    statusClass: serverCacheEnabled
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-slate-100 text-slate-600 border border-slate-200",
  };

  const cdnItem: HealthItem = {
    icon: <Cloud className="h-5 w-5" />,
    label: "Cache CDN",
    status: cdnStatus === "active" ? "ACTIVE" : cdnStatus === "degraded" ? "DEGRADED" : "INACTIVE",
    explanation:
      cdnStatus === "active"
        ? "Cache la margine cu s-maxage și stale-while-revalidate"
        : cdnStatus === "degraded"
          ? "CDN poate servi parțial"
          : "Cache CDN inactiv",
    statusClass:
      cdnStatus === "active"
        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
        : cdnStatus === "degraded"
          ? "bg-amber-100 text-amber-700 border border-amber-200"
          : "bg-slate-100 text-slate-600 border border-slate-200",
  };

  const cronExplanation = !lastCleanup
    ? "Curățarea cron nu a rulat niciodată; verifică CRON_SECRET și cron Vercel"
    : cleanupStale
      ? `Ultima curățare ${relativeTime(lastCleanup.at)}; program: ${cronSchedule}`
      : `Ultima curățare ${relativeTime(lastCleanup.at)}`;

  const cronItem: HealthItem = {
    icon: <Trash2 className="h-5 w-5" />,
    label: "Curățare cron",
    status: cronStatus,
    explanation: cronExplanation,
    statusClass:
      cronStatus === "HEALTHY"
        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
        : cronStatus === "WARNING"
          ? "bg-amber-100 text-amber-700 border border-amber-200"
          : "bg-red-100 text-red-700 border border-red-200",
  };

  const apiItem: HealthItem = {
    icon: <Plug className="h-5 w-5" />,
    label: "API cache admin",
    status: apiReachable ? "ACTIVE" : "INACTIVE",
    explanation: apiReachable
      ? "API-ul de control și evenimente răspunde"
      : "API cache admin inaccesibil",
    statusClass: apiReachable
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-red-100 text-red-700 border border-red-200",
  };

  const items = [serverItem, cdnItem, cronItem, apiItem];

  const statusLabel: Record<string, string> = {
    ACTIVE: "Activ",
    HEALTHY: "OK",
    DEGRADED: "Degradat",
    INACTIVE: "Inactiv",
    WARNING: "Atenție",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-4">Stare sistem</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex items-start gap-2">
              <div className="rounded bg-white border border-slate-200 p-1.5 text-slate-600 shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p
                  className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs ${item.statusClass}`}
                >
                  {statusLabel[item.status] ?? item.status}
                </p>
                <p className="mt-1.5 text-xs text-slate-600 leading-snug">{item.explanation}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {cronSecretConfigured === false && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          CRON_SECRET nu e configurat; cron-ul de curățare nu va rula în producție.
        </p>
      )}
    </div>
  );
}
