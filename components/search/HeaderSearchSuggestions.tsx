"use client";

import React, { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { HeaderSuggestItem } from "@/lib/search/useHeaderSearchSuggestions";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(label: string, query: string): React.ReactNode {
  if (!query.trim()) return label;
  const parts = label.split(new RegExp(`(${escapeRegex(query.trim())})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="bg-amber-200/80 dark:bg-amber-500/30 font-semibold rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export type HeaderSearchSuggestionsProps = {
  open: boolean;
  items: HeaderSuggestItem[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (item: HeaderSuggestItem) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  query: string;
  isDarkMode: boolean;
  /** When true and items.length === 0 and query.length >= 2, show "No results" */
  showEmptyState?: boolean;
  status?: "idle" | "loading" | "success" | "error";
};

function HeaderSearchSuggestionsInner({
  open,
  items,
  activeIndex,
  onHoverIndex,
  onSelect,
  anchorRef,
  query,
  isDarkMode,
  showEmptyState = true,
  status = "success",
}: HeaderSearchSuggestionsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const option = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, activeIndex]);

  if (!open) return null;

  const position = anchorRef.current
    ? (() => {
        const rect = anchorRef.current.getBoundingClientRect();
        return { top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 384) };
      })()
    : null;

  const isEmpty = items.length === 0;
  const showNoResults = showEmptyState && query.trim().length >= 2 && isEmpty && status === "success";

  const content = (
    <div
      data-header-search-suggestions
      role="listbox"
      aria-label="Sugestii căutare"
      id="header-search-listbox"
      className={`rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-[min(70vh,400px)] overflow-y-auto ${
        isDarkMode ? "bg-gray-900/98 border border-white/10" : "bg-white/98 border border-gray-200/50"
      }`}
      style={
        position
          ? {
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              zIndex: 100002,
            }
          : undefined
    }
    >
      {status === "loading" && (
        <div
          className={`px-4 py-6 text-center text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          aria-live="polite"
        >
          Se încarcă...
        </div>
      )}
      {status === "error" && (
        <div
          className={`px-4 py-3 text-sm ${isDarkMode ? "text-red-300" : "text-red-600"}`}
          role="alert"
        >
          Eroare la încărcarea sugestiilor.
        </div>
      )}
      {!isEmpty && (
        <ul ref={listRef} className="py-1" tabIndex={-1}>
          {items.map((item, i) => (
            <li key={`${item.q}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === i}
                data-index={i}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelect(item)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors outline-none ${
                  activeIndex === i
                    ? isDarkMode
                      ? "bg-white/10 text-white"
                      : "bg-gray-100 text-gray-900"
                    : isDarkMode
                      ? "hover:bg-white/5 text-gray-200"
                      : "hover:bg-gray-50 text-gray-800"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    isDarkMode ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4 opacity-50"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                </span>
                <span className="flex-1 min-w-0 font-medium text-sm truncate">
                  {highlightMatch(item.label, query)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showNoResults && (
        <div
          className={`px-4 py-4 text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          role="status"
        >
          Niciun rezultat.
        </div>
      )}
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}

export const HeaderSearchSuggestions = memo(HeaderSearchSuggestionsInner);
