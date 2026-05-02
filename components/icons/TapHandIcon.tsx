"use client";

import type { ComponentProps } from "react";

/** Inline SVG tap hand / pointer finger (replaces tap-hand.png). */
export function TapHandIcon({
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
      <path d="M10 2a1 1 0 0 1 1 1v6.5h.5a1.5 1.5 0 0 1 1.5 1.5v.5h.5a1.5 1.5 0 0 1 1.5 1.5v.5h.5a1.5 1.5 0 0 1 1.5 1.5V20a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2.5a1.5 1.5 0 0 0-1.5-1.5H9V15a1.5 1.5 0 0 0-1.5-1.5H7V13a1.5 1.5 0 0 0-1.5-1.5H5V4a2 2 0 0 1 2-2h3a1 1 0 0 1 1 1v0z" />
    </svg>
  );
}
