"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export type HeaderSuggestItem = {
  label: string;
  q: string;
  type?: string;
  meta?: Record<string, unknown>;
  categorySlug?: string;
  subcategorySlug?: string;
};

export type HeaderSuggestStatus = "idle" | "loading" | "success" | "error";

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 30_000;
const TRENDING_MAX = 8;

const TRENDING: HeaderSuggestItem[] = [
  { label: "Apartamente", q: "Apartamente", type: "query", categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  { label: "Autoturisme", q: "Autoturisme", type: "query", categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  { label: "Piese auto", q: "Piese auto", type: "query", categorySlug: "autovehicule", subcategorySlug: "piese-auto" },
  { label: "Terenuri", q: "Terenuri", type: "query", categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane" },
  { label: "Spațiu comercial", q: "Spațiu comercial", type: "query" },
  { label: "iPhone", q: "iPhone", type: "query" },
  { label: "Laptop", q: "Laptop", type: "query" },
  { label: "Mobilier", q: "Mobilier", type: "query" },
];

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

type CacheEntry = { items: HeaderSuggestItem[]; ts: number };

const memoryCache = new Map<string, CacheEntry>();

function getCached(key: string): HeaderSuggestItem[] | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.items;
}

function setCached(key: string, items: HeaderSuggestItem[]): void {
  memoryCache.set(key, { items, ts: Date.now() });
}

function parseResponse(data: unknown): HeaderSuggestItem[] {
  if (!data || typeof data !== "object") return [];

  // New /api/search/suggest response
  if ("suggestions" in data && Array.isArray((data as { suggestions?: unknown }).suggestions)) {
    const s = (data as { suggestions: Array<{ label?: string; q?: string; type?: string; categorySlug?: string; subcategorySlug?: string }> }).suggestions;
    return s
      .filter((x) => typeof x?.q === "string" && x.q.trim().length > 0)
      .map((x) => ({
        label: typeof x.label === "string" && x.label.trim().length > 0 ? x.label : String(x.q),
        q: String(x.q),
        type: typeof x.type === "string" ? x.type : "query",
        categorySlug: typeof x.categorySlug === "string" ? x.categorySlug : undefined,
        subcategorySlug: typeof x.subcategorySlug === "string" ? x.subcategorySlug : undefined,
      }));
  }

  // Legacy /api/ro/search/suggest response
  if ("items" in data) {
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((x: unknown): HeaderSuggestItem[] => {
      if (!x || typeof x !== "object" || !("phrase" in x)) return [];
      const phrase = String((x as { phrase: unknown }).phrase);
      return [
        {
          label: phrase,
          q: phrase,
          type: typeof (x as { kind?: unknown }).kind === "string" ? (x as unknown as { kind: string }).kind : undefined,
          meta:
            typeof (x as { meta?: unknown }).meta === "object" && (x as { meta?: unknown }).meta !== null
              ? (x as unknown as { meta: Record<string, unknown> }).meta
              : undefined,
        },
      ];
    });
  }
  return [];
}

export type UseHeaderSearchSuggestionsOptions = {
  q: string;
  limit?: number;
};

export function useHeaderSearchSuggestions(
  options: UseHeaderSearchSuggestionsOptions
): {
  items: HeaderSuggestItem[];
  status: HeaderSuggestStatus;
  error?: string;
} {
  const { q, limit = 10 } = options;
  const qNorm = useMemo(() => normalizeQuery(q), [q]);
  const limitVal = Math.min(Math.max(Number(limit) || 10, 1), 20);

  const [items, setItems] = useState<HeaderSuggestItem[]>([]);
  const [status, setStatus] = useState<HeaderSuggestStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (query: string) => {
      const normalized = normalizeQuery(query);

      if (normalized.length < 2) {
        setItems(TRENDING.slice(0, TRENDING_MAX));
        setStatus("idle");
        setError(undefined);
        return;
      }

      const cacheKey = `${normalized}|${limitVal}`;
      const cached = getCached(cacheKey);
      if (cached !== null) {
        setItems(cached);
        setStatus("success");
        setError(undefined);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      setStatus("loading");

      try {
        const url = `/api/search/suggest?q=${encodeURIComponent(query.trim())}&limit=${limitVal}&t=${Date.now()}`;
        const res = await fetch(url, { signal });
        if (signal.aborted) return;
        if (!res.ok) {
          setItems([]);
          setStatus("error");
          setError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as unknown;
        if (signal.aborted) return;
        const parsed = parseResponse(data);
        setCached(cacheKey, parsed);
        setItems(parsed);
        setStatus("success");
        setError(undefined);
      } catch (err) {
        if (signal.aborted) return;
        setItems([]);
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [limitVal]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (qNorm.length < 2) {
      setItems(TRENDING.slice(0, TRENDING_MAX));
      setStatus("idle");
      setError(undefined);
      return;
    }

    // Avoid showing stale trending while waiting for fetch
    setStatus("loading");
    setItems([]);
    setError(undefined);

    debounceRef.current = setTimeout(() => run(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, qNorm, run]);

  return useMemo(() => ({ items, status, error }), [items, status, error]);
}
