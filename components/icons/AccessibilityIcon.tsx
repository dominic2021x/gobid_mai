"use client";

import type { ComponentProps } from "react";

/** Inline SVG accessibility icon (replaces accessibility-icon.png). */
export function AccessibilityIcon({
  className,
  ...rest
}: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1v2h2.5l.5 4H9.5l.5-4H12v-2h-1V8H9V7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 4 0zm-2 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-5 5h2v4h-2v-4zm4 0h2v4h-2v-4z" />
    </svg>
  );
}
