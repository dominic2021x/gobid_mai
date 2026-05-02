"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAutocompleteSuggestions } from "@/components/search/hooks/useAutocompleteSuggestions";
import { useKeyboardSuggestionNavigation } from "@/components/search/hooks/useKeyboardSuggestionNavigation";
import { SearchSuggestionsDropdown } from "@/components/search/SearchSuggestionsDropdown";
import type { AutocompleteSuggestionItem } from "@/components/search/hooks/useAutocompleteSuggestions";

const SUGGEST_TRACK_URL = "/api/ro/search/suggest/track";

function trackSuggest(
  eventType: "impression" | "click" | "submit",
  queryNorm: string,
  payload: { suggestions?: Array<{ phrase_norm: string; kind: string }>; phrase_norm?: string; kind?: string }
): void {
  if (typeof window === "undefined" || queryNorm.length < 2) return;
  const body: Record<string, unknown> = {
    event_type: eventType,
    query_norm: queryNorm.slice(0, 120),
    ...payload,
  };
  fetch(SUGGEST_TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export type AutocompleteSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  isDarkMode?: boolean;
  /** Called when user submits (Enter with no selection) or selects a suggestion. Receives the search URL path (e.g. /ro?q=...) or query. */
  onNavigate?: (urlOrQuery: string) => void;
  /** Optional ref for the input element. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Max suggestions to show (default 8). */
  maxSuggestions?: number;
};

export function AutocompleteSearchInput({
  value,
  onChange,
  placeholder = "Căutare rapidă...",
  className = "",
  inputClassName = "",
  isDarkMode = false,
  onNavigate,
  inputRef: externalInputRef,
  maxSuggestions = 8,
}: AutocompleteSearchInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressionSentRef = useRef<string | null>(null);

  const { items, status, queryNorm } = useAutocompleteSuggestions({
    q: value,
    limit: maxSuggestions,
  });

  const handleSelect = useCallback(
    (item: AutocompleteSuggestionItem) => {
      const phraseNorm = item.phrase_norm ?? item.q.trim().toLowerCase().replace(/\s+/g, " ");
      const kind = item.type ?? "query";
      trackSuggest("click", queryNorm, { phrase_norm: phraseNorm, kind });
      setOpen(false);
      setActiveIndex(-1);
      onChange(item.label);
      const params = new URLSearchParams();
      params.set("q", item.q);
      const categorySlug =
        typeof item.meta?.categorySlug === "string" ? item.meta.categorySlug : undefined;
      const subcategorySlug =
        typeof item.meta?.subcategorySlug === "string" ? item.meta.subcategorySlug : undefined;
      if (categorySlug) params.set("category", categorySlug);
      if (subcategorySlug) params.set("subcategory", subcategorySlug);
      const targetUrl = `/ro?${params.toString()}`;
      if (onNavigate) {
        onNavigate(targetUrl);
      } else if (typeof window !== "undefined") {
        window.location.href = targetUrl;
      }
    },
    [onChange, onNavigate, queryNorm]
  );

  const handleEscape = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [inputRef]);

  const handleEnterNoSelection = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    setActiveIndex(-1);
    if (onNavigate) {
      onNavigate(`/ro?q=${encodeURIComponent(q)}`);
    } else if (typeof window !== "undefined") {
      window.location.href = `/ro?q=${encodeURIComponent(q)}`;
    }
  }, [value, onNavigate]);

  const onKeyDown = useKeyboardSuggestionNavigation({
    activeIndex,
    setActiveIndex,
    itemCount: items.length,
    isOpen: open,
    onSelect: handleSelect,
    onEscape: handleEscape,
    onEnterNoSelection: handleEnterNoSelection,
    items,
  });

  useEffect(() => {
    if (open && items.length > 0 && queryNorm.length >= 2) {
      const key = `${queryNorm}|${items.map((i) => i.phrase_norm ?? i.q).join(",")}`;
      if (impressionSentRef.current !== key) {
        impressionSentRef.current = key;
        trackSuggest(
          "impression",
          queryNorm,
          {
            suggestions: items.map((i) => ({
              phrase_norm: i.phrase_norm ?? i.q.trim().toLowerCase().replace(/\s+/g, " "),
              kind: i.type ?? "query",
            })),
          }
        );
      }
    } else if (!open || queryNorm.length < 2) {
      impressionSentRef.current = null;
    }
  }, [open, items, queryNorm]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      const el = target as HTMLElement;
      if (el.closest("[data-search-suggestions-dropdown]")) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setOpen(true);
          if (blurTimerRef.current) {
            clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => {
            setOpen(false);
            setActiveIndex(-1);
            blurTimerRef.current = null;
          }, 150);
        }}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-controls="search-suggestions-listbox"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
      />
      <SearchSuggestionsDropdown
        open={open}
        items={items}
        activeIndex={items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1)}
        onHoverIndex={setActiveIndex}
        onSelect={handleSelect}
        anchorRef={inputRef}
        query={value}
        isDarkMode={isDarkMode}
        showEmptyState
        status={status}
        maxVisible={maxSuggestions}
      />
    </div>
  );
}
