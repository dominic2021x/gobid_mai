"use client";

import { cn } from "@/lib/utils";

interface RangePillProps {
  min: number | string;
  max: number | string;
  current: number | string;
  goodRange?: string;
  status?: "good" | "warn" | "bad" | "neutral";
  className?: string;
}

const statusDot: Record<string, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-slate-400",
};

export function RangePill({
  min,
  max,
  current,
  goodRange,
  status = "neutral",
  className,
}: RangePillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm",
        className
      )}
      role="status"
      aria-label={`Current: ${current}, Range: ${min}–${max}`}
    >
      <span className={cn("h-2 w-2 rounded-full", statusDot[status])} aria-hidden />
      <span className="text-slate-600">Current: {current}</span>
      <span className="text-slate-400">•</span>
      <span className="text-slate-500">
        {goodRange ? `Green: ${goodRange}` : `${min}–${max}`}
      </span>
    </div>
  );
}
