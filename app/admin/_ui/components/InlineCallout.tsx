"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CalloutVariant = "info" | "success" | "warn" | "error";

const variantStyles: Record<CalloutVariant, string> = {
  info: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

interface InlineCalloutProps {
  title?: string;
  children: ReactNode;
  variant?: CalloutVariant;
  icon?: ReactNode;
  className?: string;
}

export function InlineCallout({
  title = "Next step",
  children,
  variant = "info",
  icon,
  className,
}: InlineCalloutProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        variantStyles[variant],
        className
      )}
      role="status"
    >
      {icon && <span className="flex-shrink-0 text-current">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
          {title}
        </p>
        <p className="mt-1 text-sm">{children}</p>
      </div>
    </div>
  );
}
