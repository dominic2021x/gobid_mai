"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ButtonWithIconProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size"
> & {
  label: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "error";
};

/**
 * Buton pill cu text + cerc icon (ArrowUpRight) care glisează la hover — același pattern ca demo shadcn.
 */
export function ButtonWithIcon({
  label,
  icon,
  tone = "default",
  className,
  disabled,
  ...props
}: ButtonWithIconProps) {
  const toneClassName =
    tone === "success"
      ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
      : tone === "error"
        ? "bg-red-600 text-white hover:bg-red-700 hover:text-white"
        : "bg-black text-white hover:bg-neutral-800 hover:text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200";
  const iconClassName =
    tone === "success"
      ? "bg-white text-emerald-700"
      : tone === "error"
        ? "bg-white text-red-700"
        : "bg-white text-black dark:bg-black dark:text-white";

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-full border-0 p-1 ps-6 pe-14 text-sm font-medium shadow-md",
        "transition-all duration-500 hover:ps-14 hover:pe-6",
        "group cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
        toneClassName,
        className
      )}
      {...props}
    >
      <span className="relative z-10 transition-all duration-500">{label}</span>
      <div
        className={cn(
          "absolute right-1 flex h-10 w-10 items-center justify-center rounded-full shadow-sm",
          "transition-all duration-500 group-hover:right-[calc(100%-44px)] group-hover:rotate-45",
          iconClassName
        )}
      >
        {icon ?? <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden />}
      </div>
    </Button>
  );
}
