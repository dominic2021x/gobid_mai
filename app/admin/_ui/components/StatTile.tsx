"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusLevel = "good" | "warn" | "bad" | "neutral";

const statusStyles: Record<StatusLevel, string> = {
  good: "border-l-emerald-500 bg-emerald-50/30",
  warn: "border-l-amber-500 bg-amber-50/30",
  bad: "border-l-red-500 bg-red-50/30",
  neutral: "border-l-slate-400 bg-slate-50/50",
};

interface StatTileProps {
  title: string;
  value: string | number;
  status?: StatusLevel;
  greenRange?: string;
  min?: string | number;
  max?: string | number;
  hint?: string;
  nextStep?: string;
  icon?: ReactNode;
  className?: string;
}

export function StatTile({
  title,
  value,
  status = "neutral",
  greenRange,
  min,
  max,
  hint,
  nextStep,
  icon,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md",
        statusStyles[status],
        className
      )}
      role="region"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {value}
          </p>
          {(greenRange || min != null || max != null) && (
            <p className="mt-1 text-xs text-slate-600">
              {greenRange
                ? `Green range: ${greenRange}`
                : [min != null && `Min: ${min}`, max != null && `Max: ${max}`]
                    .filter(Boolean)
                    .join(" • ")}
            </p>
          )}
          {hint && (
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          )}
          {nextStep && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              Next: {nextStep}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 text-slate-400" aria-hidden>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
