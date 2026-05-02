"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { normalizeRo } from "@/lib/search/roNormalize";
import { readSearchHistory } from "@/lib/search/sessionHistory";

export type SearchSuggestionItem = {
  phrase: string;
  kind?: string;
  source: "personal" | "global";
};

export type SearchSuggestionsContext = {
  category?: string;
  subcategory?: string;
  county?: string;
  city?: string;
};

const PERSONAL_MAX = 3;
const GLOBAL_MAX = 7;

const TRENDING_PHRASES = [
  "Apartamente",
  "Autoturisme",
  "Piese auto",
  "Terenuri",
  "Spațiu comercial",
  "iPhone",
  "Laptop",
  "Mobilier",
];

function buildGlobalUrl(q: string, limit: number, context?: SearchSuggestionsContext | null): string {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (context?.category) params.set("category", context.category);
  if (context?.subcategory) params.set("subcategory", context.subcategory);
  if (context?.county) params.set("county", context.county);
  if (context?.city) params.set("city", context.city);
  return `/api/ro/search/suggest?${params.toString()}`;
}

export function useSearchSuggestions(
  q: string,
  context?: SearchSuggestionsContext | null,
  accessToken?: string | null,
  debounceMs = 140
): { items: SearchSuggestionItem[]; loading: boolean } {
  const [items, setItems] = useState<SearchSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (query: string) => {
      const trimmed = query.trim();

      if (trimmed === "") {
        const history = readSearchHistory();
        const personal = history.slice(0, PERSONAL_MAX).map((phrase) => ({
          phrase,
          source: "personal" as const,
        }));
        setItems(personal);
        setLoading(false);
        return;
      }

      if (trimmed.length < 2) {
        setItems(
          TRENDING_PHRASES.map((phrase) => ({ phrase, source: "global" as const }))
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const fetchGlobal = async (): Promise<SearchSuggestionItem[]> => {
        const res = await fetch(buildGlobalUrl(trimmed, 10, context), { signal });
        if (!res.ok) return [];
        const data = (await res.json()) as { ok?: boolean; items?: { phrase: string; kind?: string }[] };
        if (!data.ok || !Array.isArray(data.items)) return [];
        return data.items.map((x) => ({ phrase: x.phrase, kind: x.kind, source: "global" as const }));
      };

      const fetchPersonal = async (): Promise<SearchSuggestionItem[]> => {
        if (accessToken) {
          const res = await fetch(
            `/api/ro/search/suggest/personal?q=${encodeURIComponent(trimmed)}&limit=5`,
            { headers: { Authorization: `Bearer ${accessToken}` }, signal }
          );
          if (!res.ok) return [];
          const data = (await res.json()) as { ok?: boolean; items?: { phrase: string }[] };
          if (!data.ok || !Array.isArray(data.items)) return [];
          return data.items.map((x) => ({ phrase: x.phrase, source: "personal" as const }));
        }
        const history = readSearchHistory();
        const lower = trimmed.toLowerCase();
        const filtered = history.filter((s) => s.toLowerCase().startsWith(lower)).slice(0, 5);
        return filtered.map((phrase) => ({ phrase, source: "personal" as const }));
      };

      try {
        const [globalList, personalList] = await Promise.all([fetchGlobal(), fetchPersonal()]);
        const takePersonal = personalList.slice(0, PERSONAL_MAX);
        const takeGlobal = globalList.slice(0, GLOBAL_MAX);
        const seenNorm = new Set<string>();
        const mixed: SearchSuggestionItem[] = [];
        for (const it of takePersonal) {
          const norm = normalizeRo(it.phrase);
          if (norm && !seenNorm.has(norm)) {
            seenNorm.add(norm);
            mixed.push(it);
          }
        }
        for (const it of takeGlobal) {
          const norm = normalizeRo(it.phrase);
          if (norm && !seenNorm.has(norm)) {
            seenNorm.add(norm);
            mixed.push(it);
          }
        }
        setItems(mixed);
      } catch {
        if (!signal.aborted) setItems([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [context?.category, context?.subcategory, context?.county, context?.city, accessToken]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(q), debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, debounceMs, run]);

  return { items, loading };
}
