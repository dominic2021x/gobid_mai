"use client";

import { useCallback } from "react";

export type SuggestionItem = { label: string; q: string; [k: string]: unknown };

export type UseKeyboardSuggestionNavigationOptions<T extends SuggestionItem> = {
  activeIndex: number;
  setActiveIndex: (index: number | ((prev: number) => number)) => void;
  itemCount: number;
  isOpen: boolean;
  onSelect: (item: T) => void;
  onEscape: () => void;
  /** When user presses Enter with no selection (activeIndex < 0). Default: no-op. */
  onEnterNoSelection?: () => void;
  items: T[];
};

/**
 * Returns an onKeyDown handler for arrow/enter/escape in a suggestion list.
 */
export function useKeyboardSuggestionNavigation<T extends SuggestionItem>(
  options: UseKeyboardSuggestionNavigationOptions<T>
): (e: React.KeyboardEvent) => void {
  const {
    activeIndex,
    setActiveIndex,
    itemCount,
    isOpen,
    onSelect,
    onEscape,
    onEnterNoSelection,
    items,
  } = options;

  return useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (itemCount > 0 ? Math.min(i + 1, itemCount - 1) : -1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (itemCount > 0 ? Math.max(i - 1, 0) : -1));
        return;
      }
      if (e.key === "Enter") {
        if (itemCount > 0 && activeIndex >= 0 && activeIndex < items.length) {
          e.preventDefault();
          onSelect(items[activeIndex]);
        } else if (onEnterNoSelection) {
          e.preventDefault();
          onEnterNoSelection();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    },
    [
      isOpen,
      itemCount,
      activeIndex,
      items,
      setActiveIndex,
      onSelect,
      onEscape,
      onEnterNoSelection,
    ]
  );
}
