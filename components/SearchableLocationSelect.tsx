"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";

const normalizeForFilter = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type SearchableLocationSelectProps = {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  variant: "sidebar" | "toolbar";
  isDarkMode: boolean;
};

export default function SearchableLocationSelect({
  value,
  onChange,
  allLabel,
  variant,
  isDarkMode,
}: SearchableLocationSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = value && value !== "all";
  const displayLabel = hasValue ? value : allLabel;

  const filteredCities = searchQuery.trim()
    ? ROMANIAN_CITIES.filter((city) =>
        normalizeForFilter(city).includes(normalizeForFilter(searchQuery))
      )
    : ROMANIAN_CITIES;

  useEffect(() => {
    if (!open) {
      setDropdownRect(null);
      return;
    }
    setSearchQuery("");
    if (triggerRef.current) {
      setDropdownRect(triggerRef.current.getBoundingClientRect());
    }
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const updateRect = () => {
      if (triggerRef.current) setDropdownRect(triggerRef.current.getBoundingClientRect());
    };
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const select = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  const triggerBase =
    variant === "sidebar"
      ? "w-full px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer pr-10 text-left flex items-center justify-between gap-2"
      : "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all cursor-pointer pr-9";

  const triggerStyle = hasValue
    ? "bg-orange-500 border-orange-500 text-white"
    : variant === "toolbar" && isDarkMode
      ? "bg-gray-800 border-gray-600 text-gray-200 hover:border-orange-500/50"
      : variant === "toolbar" && !isDarkMode
        ? "bg-white border-gray-200 text-gray-800 hover:border-orange-400"
        : isDarkMode
          ? "bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500"
          : "bg-white border-gray-200 text-gray-900 hover:border-gray-300";

  const dropdownBg = isDarkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200";
  const inputBg = isDarkMode
    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500"
    : "bg-white border-gray-200 text-gray-900 placeholder-gray-400";
  const optionHover = isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100";

  const dropdownContent = open && dropdownRect && typeof document !== "undefined" && (
    <div
      className={`fixed z-[9999] max-h-[280px] flex flex-col rounded-xl border-2 shadow-xl overflow-hidden ${dropdownBg}`}
      style={{
        top: dropdownRect.bottom + 4,
        left: dropdownRect.left,
        width: Math.max(dropdownRect.width, 220),
        minWidth: 220,
      }}
      role="listbox"
    >
      <div className="p-2 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Caută oraș..."
          className={`w-full px-3 py-2 rounded-lg border-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${inputBg}`}
          aria-label="Caută oraș"
        />
      </div>
      <div className="overflow-y-auto flex-1 overscroll-contain" style={{ maxHeight: "220px" }}>
        <button
          type="button"
          onClick={() => select("all")}
          className={`w-full px-3 py-2.5 text-left text-sm ${optionHover} ${!hasValue ? "bg-orange-500/20 text-orange-600 dark:text-orange-400" : isDarkMode ? "text-gray-200" : "text-gray-900"}`}
          role="option"
          aria-selected={!hasValue}
        >
          {allLabel}
        </button>
        {filteredCities.length === 0 ? (
          <div className={`px-3 py-4 text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            Niciun oraș găsit
          </div>
        ) : (
          filteredCities.map((city, idx) => (
            <button
              key={`${city}-${idx}`}
              type="button"
              onClick={() => select(city)}
              className={`w-full px-3 py-2 text-left text-sm ${optionHover} ${value === city ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 font-medium" : isDarkMode ? "text-gray-200" : "text-gray-900"}`}
              role="option"
              aria-selected={value === city}
            >
              {city}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={variant === "sidebar" ? "w-full" : "relative flex-shrink-0"}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${triggerBase} ${triggerStyle}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Locație"
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`w-5 h-5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {typeof document !== "undefined" && dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
