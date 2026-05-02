"use client";

import React from "react";
import { AutocompleteSearchInput, type AutocompleteSearchInputProps } from "@/components/search/AutocompleteSearchInput";

export type SearchBoxProps = Omit<AutocompleteSearchInputProps, "maxSuggestions"> & {
  maxSuggestions?: number;
};

/**
 * Lightweight search box wired to /api/search/suggest through shared hooks.
 * Includes keyboard navigation, matched text highlighting, loading state and outside-click close.
 */
export function SearchBox({ maxSuggestions = 8, ...props }: SearchBoxProps) {
  const safeLimit = Math.min(Math.max(Number(maxSuggestions) || 8, 5), 10);
  return <AutocompleteSearchInput {...props} maxSuggestions={safeLimit} />;
}

export default SearchBox;
