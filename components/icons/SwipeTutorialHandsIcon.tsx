"use client";

import type { ComponentProps } from "react";

/** Inline SVG two hands for swipe tutorial (replaces swipe-tutorial-hands.png). */
export function SwipeTutorialHandsIcon({
  className,
  ...rest
}: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      <path d="M8 4a2 2 0 0 1 2 2v6h1a1.5 1.5 0 0 1 1.5 1.5v2h1a1.5 1.5 0 0 1 1.5 1.5V22H6v-4.5A1.5 1.5 0 0 1 7.5 16h1v-2A1.5 1.5 0 0 1 10 12.5h1V6a2 2 0 0 1 2-2H8zm28 0a2 2 0 0 0-2 2v6h-1A1.5 1.5 0 0 0 31.5 14v2h-1A1.5 1.5 0 0 0 29 17.5V22h6v-4.5a1.5 1.5 0 0 0-1.5-1.5h-1v-2a1.5 1.5 0 0 0 1.5-1.5h-1V6a2 2 0 0 0-2-2h-2z" />
    </svg>
  );
}
