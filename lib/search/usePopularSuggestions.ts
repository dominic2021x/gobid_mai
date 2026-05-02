"use client";

import { useState, useEffect, useMemo } from "react";
import { readSearchHistory } from "@/lib/search/sessionHistory";

const AI_SUGGESTIONS_KEY = "aiSuggestions";

export type PopularSuggestionItem =
  | string
  | { label: string; q: string; categorySlug?: string; subcategorySlug?: string };

/** Listă statică folosită când nu există istoric și nici aiSuggestions în localStorage. */
const POPULAR_SEARCH_SUGGESTIONS: PopularSuggestionItem[] = [
  { label: "Autoturism", q: "Autoturism", categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  { label: "Apartament", q: "Apartament", categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  { label: "Piese auto", q: "Piese auto", categorySlug: "autovehicule", subcategorySlug: "piese-auto" },
  { label: "Teren", q: "Teren", categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane" },
  { label: "iPhone", q: "iPhone" },
  { label: "Laptop", q: "Laptop" },
  { label: "Mobilier", q: "Mobilier" },
  { label: "Instrument", q: "Instrument" },
];

const POPULAR_SLUGS_BY_QUERY: Record<string, { categorySlug?: string; subcategorySlug?: string }> = {
  apartament: { categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  apartamente: { categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  autoturism: { categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  autoturisme: { categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  "piese auto": { categorySlug: "autovehicule", subcategorySlug: "piese-auto" },
  teren: { categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane" },
  terenuri: { categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane" },
};

const SINGULAR_BY_QUERY: Record<string, string> = {
  apartamente: "apartament",
  autoturisme: "autoturism",
  terenuri: "teren",
  instrumente: "instrument",
};

function toSingularLabel(value: string): string {
  const trimmed = value.trim();
  const mapped = SINGULAR_BY_QUERY[trimmed.toLowerCase()];
  if (!mapped) return trimmed;
  return mapped.charAt(0).toUpperCase() + mapped.slice(1);
}

function enrichPopularItem(item: PopularSuggestionItem): PopularSuggestionItem {
  if (typeof item !== "string") {
    const qSingular = toSingularLabel(item.q);
    const norm = qSingular.trim().toLowerCase();
    const mapped = POPULAR_SLUGS_BY_QUERY[norm];
    const next: Exclude<PopularSuggestionItem, string> = {
      ...item,
      label: toSingularLabel(item.label),
      q: qSingular,
    };
    if (!mapped) return next;
    return {
      ...next,
      categorySlug: next.categorySlug ?? mapped.categorySlug,
      subcategorySlug: next.subcategorySlug ?? mapped.subcategorySlug,
    };
  }
  const q = toSingularLabel(item);
  const mapped = POPULAR_SLUGS_BY_QUERY[q.toLowerCase()];
  if (!mapped) return item;
  return { label: q, q, ...mapped };
}

function readAiSuggestionsFromStorage(): PopularSuggestionItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AI_SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is PopularSuggestionItem => {
        if (typeof x === "string") return true;
        if (x && typeof x === "object" && "label" in x && "q" in x) return true;
        return false;
      })
      .slice(0, 24);
  } catch {
    return [];
  }
}

/**
 * Furnizează sugestiile de afișat în header când search e gol:
 * - Dacă există istoric căutări: „Căutări recente” (isFromHistory = true).
 * - Altfel: „Căutări frecvente” din localStorage.aiSuggestions sau lista statică (isFromHistory = false).
 */
export function usePopularSuggestions(): {
  popularSuggestions: PopularSuggestionItem[];
  isFromHistory: boolean;
} {
  const [history, setHistory] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<PopularSuggestionItem[]>([]);

  useEffect(() => {
    setHistory(readSearchHistory());
    setAiSuggestions(readAiSuggestionsFromStorage());
  }, []);

  return useMemo(() => {
    if (history.length > 0) {
      return {
        popularSuggestions: history,
        isFromHistory: true,
      };
    }
    const frequent = (aiSuggestions.length > 0 ? aiSuggestions : POPULAR_SEARCH_SUGGESTIONS).map(enrichPopularItem);
    return {
      popularSuggestions: frequent,
      isFromHistory: false,
    };
  }, [history, aiSuggestions]);
}
