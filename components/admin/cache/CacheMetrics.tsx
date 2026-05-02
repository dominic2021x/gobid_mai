"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const CLEANUP_WARN_AGE_MS = 48 * 60 * 60 * 1000;
const EMPTY_VALUE = "n/a";

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

type MetricCardProps = {
  title: string;
  value: React.ReactNode;
  description: string;
  trend?: "up" | "down" | "stable";
  colorClass?: string;
};

const CARD_COLORS = [
  "border-l-blue-500 bg-blue-50/50",
  "border-l-emerald-500 bg-emerald-50/50",
  "border-l-blue-500 bg-blue-50/50",
  "border-l-amber-500 bg-amber-50/50",
  "border-l-rose-500 bg-rose-50/50",
];

function MetricCard({ title, value, description, trend, colorClass }: MetricCardProps) {
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 p-4 ${colorClass ?? "bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        {trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />}
        {trend === "stable" && <Minus className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-600 leading-snug">{description}</p>
    </div>
  );
}

type Props = {
  totalInvalidations: number;
  avgWarmupTimeMs: number | null;
  operationsLast24h: number;
  lastCleanup: { at: string; deletedRows?: number } | null;
};

export default function CacheMetrics({
  totalInvalidations,
  avgWarmupTimeMs,
  operationsLast24h,
  lastCleanup,
}: Props) {
  const cleanupStale =
    lastCleanup && Date.now() - new Date(lastCleanup.at).getTime() > CLEANUP_WARN_AGE_MS;
  const eventsPerMin =
    operationsLast24h > 0 ? (operationsLast24h / (24 * 60)).toFixed(2) : "0";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-4">Metrici cache</h2>
      {cleanupStale && (
        <p className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 mb-4 shadow-sm">
          Ultima curățare a fost acum peste 48 de ore. Verifică cron /api/cron/cache-events-cleanup.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total invalidări"
          value={totalInvalidations}
          description="Operații clear, revalidate path și revalidate tag în ultimele 24 de ore."
          trend="stable"
          colorClass={CARD_COLORS[0]}
        />
        <MetricCard
          title="Timp mediu warmup"
          value={avgWarmupTimeMs != null ? `${avgWarmupTimeMs} ms` : <span className="text-slate-400 font-normal">{EMPTY_VALUE}</span>}
          description="Latență warmup pentru preîncărcare cache (doar evenimente ok, &lt;60s)."
          trend="stable"
          colorClass={CARD_COLORS[1]}
        />
        <MetricCard
          title="Operații (ultimele 24h)"
          value={operationsLast24h}
          description="Toate operațiile de cache în ultimele 24 de ore."
          trend="stable"
          colorClass={CARD_COLORS[2]}
        />
        <MetricCard
          title="Rata evenimente"
          value={`${eventsPerMin} /min`}
          description="Evenimente per minut în ultimele 24 de ore."
          trend="stable"
          colorClass={CARD_COLORS[3]}
        />
        <MetricCard
          title="Ultima curățare"
          value={
            lastCleanup ? (
              <span title={new Date(lastCleanup.at).toLocaleString("ro-RO")}>
                {relativeTime(lastCleanup.at)}
              </span>
            ) : (
              <span className="text-amber-700 font-semibold">Nu a rulat</span>
            )
          }
          description={
            lastCleanup?.deletedRows != null
              ? `${lastCleanup.deletedRows} rânduri șterse. Cron zilnic 03:00 UTC.`
              : "Cron /api/cron/cache-events-cleanup. Setează CRON_SECRET în producție."
          }
          trend={cleanupStale ? "down" : "stable"}
          colorClass={CARD_COLORS[4]}
        />
      </div>
      {lastCleanup && cleanupStale && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-800">
          <span className="inline-flex rounded-lg border-2 border-amber-300 bg-amber-100 px-2 py-1 font-bold">
            cron învechit
          </span>
          Verifică CRON_SECRET și programul cron Vercel.
        </p>
      )}
    </div>
  );
}
