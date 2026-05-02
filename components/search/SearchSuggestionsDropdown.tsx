"use client";

import React, { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { highlightQueryText } from "@/components/search/highlightQueryText";

export type SearchSuggestionsDropdownItem = {
  label: string;
  q: string;
  phrase_norm?: string;
  type?: string;
  meta?: Record<string, unknown>;
};

export type SearchSuggestionsDropdownProps = {
  open: boolean;
  items: SearchSuggestionsDropdownItem[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (item: SearchSuggestionsDropdownItem) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  query: string;
  isDarkMode?: boolean;
  showEmptyState?: boolean;
  status?: "idle" | "loading" | "success" | "error";
  /** Max items to show (default 8). */
  maxVisible?: number;
  /** "Did you mean X?" suggestion from autocorrect; when clicked calls onDidYouMeanClick(X). */
  didYouMean?: string | null;
  onDidYouMeanClick?: (suggestedQuery: string) => void;
};

function SearchSuggestionsDropdownInner({
  open,
  items,
  activeIndex,
  onHoverIndex,
  onSelect,
  anchorRef,
  query,
  isDarkMode = false,
  showEmptyState = true,
  status = "success",
  maxVisible = 8,
  didYouMean = null,
  onDidYouMeanClick,
}: SearchSuggestionsDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const visibleItems = items.slice(0, maxVisible);
  const showDidYouMean = Boolean(didYouMean && didYouMean.trim() && onDidYouMeanClick);

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const option = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, activeIndex]);

  if (!open) return null;

  const position = anchorRef.current
    ? (() => {
        const rect = anchorRef.current.getBoundingClientRect();
        return {
          top: rect.bottom + 8,
          left: rect.left,
          width: Math.max(rect.width, 320),
        };
      })()
    : null;

  const isEmpty = visibleItems.length === 0;
  const showNoResults = showEmptyState && query.trim().length >= 2 && isEmpty && status === "success";

  const content = (
    <div
      data-search-suggestions-dropdown
      role="listbox"
      aria-label="Sugestii căutare"
      id="search-suggestions-listbox"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
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
      {showDidYouMean && (
        <div
          className={`border-b ${isDarkMode ? "border-white/10" : "border-gray-100"}`}
        >
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDidYouMeanClick!(didYouMean!.trim());
            }}
            onClick={(e) => {
              e.preventDefault();
              onDidYouMeanClick!(didYouMean!.trim());
            }}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors outline-none min-h-[44px] touch-manipulation cursor-pointer ${
              isDarkMode ? "hover:bg-white/5 text-amber-300" : "hover:bg-amber-50 text-amber-800"
            }`}
          >
            <span
              className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${
                isDarkMode ? "bg-amber-900/30" : "bg-amber-100"
              }`}
              aria-hidden
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </span>
            <span className="flex-1 min-w-0 text-sm font-medium">
              Ai vrut să spui <strong className="font-semibold truncate block">{didYouMean}</strong>?
            </span>
          </button>
        </div>
      )}
      {!isEmpty && (
        <ul ref={listRef} className="py-1" tabIndex={-1}>
          {visibleItems.map((item, i) => (
            <li key={`${item.q}-${i}`}>
              <button
                type="button"
                id={`suggestion-${i}`}
                role="option"
                aria-selected={activeIndex === i}
                data-index={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(item);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                onMouseEnter={() => onHoverIndex(i)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors outline-none min-h-[44px] touch-manipulation cursor-pointer ${
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
                  className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    isDarkMode ? "bg-gray-800" : "bg-gray-100"
                  }`}
                  aria-hidden
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4 opacity-50"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                </span>
                <span className="flex-1 min-w-0 font-medium text-sm truncate">
                  {highlightQueryText(item.label, query)}
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

export const SearchSuggestionsDropdown = memo(SearchSuggestionsDropdownInner);
