"use client";

import type { ReactNode } from "react";
import { highlightSuggestion } from "@/components/search/utils/highlightSuggestion";

/**
 * Alias helper for highlighting matched query text in search suggestions.
 * Kept separate for easy import from SearchBox / header variants.
 */
export function highlightQueryText(text: string, query: string): ReactNode {
  return highlightSuggestion(text, query);
}
