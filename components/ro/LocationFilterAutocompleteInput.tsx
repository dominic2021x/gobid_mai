"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { staticRomanianCityHints } from "@/lib/data/romanian-locality-hints";
import { cn } from "@/lib/utils";

const N = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type ApiRow = { label: string; lat: number; lon: number };
type Suggestion = { label: string; fromApi: boolean };

function mergeSuggestions(api: ApiRow[], staticCityNames: string[]): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (l: Suggestion) => {
    const k = N(l.label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(l);
  };

  for (const r of api) {
    if (r.label) add({ label: r.label, fromApi: true });
  }
  for (const city of staticCityNames) {
    const k = N(city);
    const hasApi = api.some((a) => {
      const first = a.label.split(",")[0]?.trim() || "";
      return N(first) === k;
    });
    if (!hasApi) add({ label: city, fromApi: false });
  }
  return out.slice(0, 12);
}

const DEBOUNCE_MS = 360;

export function LocationFilterAutocompleteInput({
  value,
  onChange,
  isDarkMode = false,
  className,
  inputClassName,
  placeholder = "Caută localitate, ex. Craiova sau Segarcea…",
  disabled = false,
  "aria-label": ariaLabel = "Caută localitate",
  id: idProp,
}: {
  value: string;
  onChange: (v: string) => void;
  isDarkMode?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  const genId = useId();
  const listboxId = `${(idProp ?? `loc-${genId}`).replace(/:/g, "")}-suggestions`;
  const inputId = idProp ?? `loc-in-${genId}`.replace(/:/g, "");

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiRows, setApiRows] = useState<ApiRow[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const staticCities = useMemo(() => staticRomanianCityHints(value, 8), [value]);

  const suggestions = useMemo(
    () => mergeSuggestions(apiRows, staticCities),
    [apiRows, staticCities],
  );

  const scheduleFetch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const t = q.trim();
    if (t.length < 2) {
      setApiRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const my = (seqRef.current += 1);
      try {
        const res = await fetch(`/api/ro/location-suggest?q=${encodeURIComponent(t)}`);
        const d = (await res.json()) as { ok?: boolean; suggestions?: ApiRow[] };
        if (my !== seqRef.current) return;
        if (d?.ok && Array.isArray(d.suggestions)) {
          setApiRows(d.suggestions);
        } else {
          setApiRows([]);
        }
      } catch {
        if (my === seqRef.current) setApiRows([]);
      } finally {
        if (my === seqRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, suggestions.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length > 0) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[activeIndex];
      if (s) pick(s.label);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const listSurface = isDarkMode
    ? "border-slate-500/40 bg-slate-900/95 text-slate-100 shadow-xl"
    : "border-border bg-white text-foreground shadow-lg";

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        name="locationFilter"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open && suggestions.length ? listboxId : undefined}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          setOpen(true);
          scheduleFetch(v);
        }}
        onFocus={() => {
          setOpen(true);
          scheduleFetch(value);
        }}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />

      {open && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className={cn("absolute z-[100200] mt-1 max-h-[min(16rem,45vh)] w-full overflow-y-auto overscroll-contain rounded-lg border py-1 text-left text-sm", listSurface)}
        >
          {suggestions.map((s, i) => (
            <li key={N(s.label) + String(i)} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listboxId}-opt-${i}`}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm",
                  isDarkMode ? "hover:bg-blue-500/15" : "hover:bg-muted/80",
                  i === activeIndex && (isDarkMode ? "bg-sky-500/15" : "bg-primary/5"),
                )}
                aria-selected={i === activeIndex}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(s.label);
                }}
              >
                <span className="min-w-0 flex-1 break-words leading-snug">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && loading && value.trim().length >= 2 && suggestions.length === 0 ? (
        <div
          className={cn(
            "absolute z-[100199] mt-1 w-full rounded-lg border px-3 py-2 text-xs",
            isDarkMode ? "border-slate-600 bg-slate-900/90 text-slate-400" : "border-border bg-white text-muted-foreground",
          )}
        >
          Se caută sugestii…
        </div>
      ) : null}
    </div>
  );
}
