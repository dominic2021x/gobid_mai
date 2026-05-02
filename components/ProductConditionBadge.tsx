"use client";

import { cn } from "@/lib/utils";

export type ProductConditionKind = "nou" | "uzat" | "na";

export type ProductConditionBadgeProps = {
  kind: ProductConditionKind;
  /** Pentru „Nou” / „N/A”: variante light vs dark (Uzat = mereu chihlimbar + alb). */
  isDarkMode?: boolean;
  className?: string;
  /** Icon Remix (sigiliu / recycle) — folosit pe /ro și favorite. */
  showIcon?: boolean;
  /** „compact” = text mai mic ca în grid-ul RO. */
  size?: "default" | "compact";
};

/**
 * Badge standard pentru stare produs pe site: **Uzat** = fundal chihlimbar, text alb (înlocuiește „Utilizat”).
 */
export function ProductConditionBadge({
  kind,
  isDarkMode = false,
  className,
  showIcon = false,
  size = "default",
}: ProductConditionBadgeProps) {
  const base = "inline-flex items-center rounded font-medium";
  const sizeCls =
    size === "compact"
      ? "gap-0.5 px-1.5 py-px text-[11px] leading-tight"
      : "gap-0.5 px-1.5 py-0.5 text-[10px] sm:text-xs";

  if (kind === "nou") {
    const nouCls = isDarkMode
      ? "border bg-green-500/20 text-green-300 border-green-500/30"
      : "border bg-green-500/20 text-green-800 border-green-500/30";
    return (
      <span className={cn(base, sizeCls, nouCls, className)}>
        {showIcon && <i className="text-[10px] ri-seal-line" aria-hidden />}
        Nou
      </span>
    );
  }

  if (kind === "uzat") {
    return (
      <span
        className={cn(
          base,
          sizeCls,
          "border-0 bg-amber-600/95 text-white shadow-md backdrop-blur-sm font-semibold",
          className,
        )}
      >
        {showIcon && <i className="text-[10px] ri-recycle-line" aria-hidden />}
        Uzat
      </span>
    );
  }

  const naCls = isDarkMode
    ? "border bg-gray-500/20 text-gray-400 border-gray-500/30"
    : "border bg-gray-500/20 text-gray-600 border-gray-500/30";
  return (
    <span className={cn(base, sizeCls, naCls, className)}>
      N/A
    </span>
  );
}
