"use client";

import type { ReactNode } from "react";

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights the part of `text` that matches `query` (case-insensitive).
 * Renders with <mark> for the match; no raw HTML from user input (safe).
 */
export function highlightSuggestion(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-amber-200/80 dark:bg-amber-500/30 font-semibold rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
