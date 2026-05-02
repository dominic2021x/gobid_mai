"use client";

import { cn } from "@/lib/utils";

export type StatusLevel = "good" | "warn" | "bad" | "neutral";

const statusStyles: Record<StatusLevel, string> = {
  good: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  bad: "bg-red-100 text-red-800 border-red-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
};

interface StatusBadgeProps {
  label: string;
  status?: StatusLevel;
  className?: string;
}

export function StatusBadge({ label, status = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className
      )}
      role="status"
    >
      {label}
    </span>
  );
}
