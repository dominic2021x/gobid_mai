"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export type AutocompleteSuggestionItem = {
  label: string;
  q: string;
  phrase_norm?: string;
  type?: string;
  meta?: Record<string, unknown>;
};

export type AutocompleteSuggestionsStatus = "idle" | "loading" | "success" | "error";

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 30_000;
const DISPLAY_LIMIT = 8;

const LS_GEO_COORDS = "gobid:geolocation-coords";
const RO_LAST_LOCATION_CENTER_KEY = "ro:lastLocationCenter";
const RO_LOCATION_CENTER_UPDATED_EVENT = "gobid:location-center-updated";

const TRENDING: AutocompleteSuggestionItem[] = [
  {
    label: "Apartamente",
    q: "Apartamente",
    type: "query",
    meta: { categorySlug: "imobiliare", subcategorySlug: "apartamente" },
  },
  {
    label: "Autoturisme",
    q: "Autoturisme",
    type: "query",
    meta: { categorySlug: "autovehicule", subcategorySlug: "autoturisme" },
  },
  {
    label: "Piese auto",
    q: "Piese auto",
    type: "query",
    meta: { categorySlug: "autovehicule", subcategorySlug: "piese-auto" },
  },
  {
    label: "Terenuri",
    q: "Terenuri",
    type: "query",
    meta: { categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane" },
  },
  { label: "Spațiu comercial", q: "Spațiu comercial", type: "query" },
  { label: "iPhone", q: "iPhone", type: "query" },
  { label: "Laptop", q: "Laptop", type: "query" },
  { label: "Mobilier", q: "Mobilier", type: "query" },
];

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

type CacheEntry = { items: AutocompleteSuggestionItem[]; ts: number };
const memoryCache = new Map<string, CacheEntry>();

function readStoredGeoCenter(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(RO_LAST_LOCATION_CENTER_KEY) || localStorage.getItem(LS_GEO_COORDS);
  if (!raw) return null;
  const p = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function getCached(key: string): AutocompleteSuggestionItem[] | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.items;
}

function setCached(key: string, items: AutocompleteSuggestionItem[]): void {
  memoryCache.set(key, { items, ts: Date.now() });
}

function getGeoCacheKey(center: { lat: number; lng: number } | null): string {
  if (!center) return "nogeo";
  return `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
}

type SuggestMeta = { didYouMean?: string; count?: number; source?: string; elapsedMs?: number };

function parseResponse(data: unknown): { items: AutocompleteSuggestionItem[]; meta: SuggestMeta } {
  const empty = { items: [], meta: {} };
  if (!data || typeof data !== "object") return empty;

  // New /api/search/suggest response
  if ("suggestions" in data && Array.isArray((data as { suggestions?: unknown }).suggestions)) {
    const d = data as Record<string, unknown>;
    const meta = {
      source: typeof d.source === "string" ? d.source : undefined,
      elapsedMs: typeof d.elapsedMs === "number" ? d.elapsedMs : undefined,
    } satisfies SuggestMeta;
    const parsed = (d.suggestions as unknown[])
      .map((x): AutocompleteSuggestionItem => {
        if (!x || typeof x !== "object") return { label: "", q: "", type: "query" };
        const rec = x as Record<string, unknown>;
        const label = String(rec.label ?? rec.q ?? "");
        const q = String(rec.q ?? label);
        const kind = typeof rec.type === "string" ? rec.type : "query";
        const categorySlug = typeof rec.categorySlug === "string" ? rec.categorySlug : undefined;
        const subcategorySlug = typeof rec.subcategorySlug === "string" ? rec.subcategorySlug : undefined;
        const meta =
          categorySlug || subcategorySlug
            ? { categorySlug, subcategorySlug }
            : undefined;
        return { label, q, type: kind, meta };
      })
      .filter((i) => i.label.length > 0);
    return { items: parsed, meta };
  }

  // Legacy /api/ro/search/suggest response
  if ("items" in data) {
    const items = (data as { items?: unknown }).items;
    const meta = (data as { meta?: SuggestMeta }).meta ?? {};
    if (!Array.isArray(items)) return { ...empty, meta };
    const parsed = items
      .map((x: unknown): AutocompleteSuggestionItem => {
        if (!x || typeof x !== "object" || !("phrase" in x)) {
          return { label: "", q: "", type: "query" };
        }
        const rec = x as Record<string, unknown>;
        const phrase = String(rec.phrase);
        const kind = typeof rec.kind === "string" ? rec.kind : "query";
        const phrase_norm = typeof rec.phrase_norm === "string" ? rec.phrase_norm : undefined;
        const rawMeta = rec.meta;
        const itemMeta =
          typeof rawMeta === "object" && rawMeta !== null ? (rawMeta as Record<string, unknown>) : undefined;
        return { label: phrase, q: phrase, phrase_norm, type: kind, meta: itemMeta };
      })
      .filter((i) => i.label.length > 0);
    return { items: parsed, meta };
  }
  return empty;
}

export type UseAutocompleteSuggestionsOptions = {
  q: string;
  limit?: number;
};

export function useAutocompleteSuggestions(
  options: UseAutocompleteSuggestionsOptions
): {
  items: AutocompleteSuggestionItem[];
  status: AutocompleteSuggestionsStatus;
  error?: string;
  queryNorm: string;
  meta: SuggestMeta;
} {
  const { q, limit = 10 } = options;
  const qNorm = useMemo(() => normalizeQuery(q), [q]);
  const limitVal = Math.min(Math.max(Number(limit) || 8, 5), 10);
  const requestIdRef = useRef(0);

  const [items, setItems] = useState<AutocompleteSuggestionItem[]>([]);
  const [meta, setMeta] = useState<SuggestMeta>({});
  const [status, setStatus] = useState<AutocompleteSuggestionsStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncStoredGeo = () => {
      try {
        geoRef.current = readStoredGeoCenter();
      } catch {
        /* private mode / blocked storage */
      }
    };

    syncStoredGeo();
    window.addEventListener(RO_LOCATION_CENTER_UPDATED_EVENT, syncStoredGeo);
    window.addEventListener("storage", syncStoredGeo);
    return () => {
      window.removeEventListener(RO_LOCATION_CENTER_UPDATED_EVENT, syncStoredGeo);
      window.removeEventListener("storage", syncStoredGeo);
    };
  }, []);

  const run = useCallback(
    async (query: string) => {
      const normalized = normalizeQuery(query);

      if (normalized.length < 2) {
        setItems(TRENDING.slice(0, DISPLAY_LIMIT));
        setStatus("idle");
        setError(undefined);
        return;
      }

      const geoCacheKey = getGeoCacheKey(geoRef.current);
      const cacheKey = `${normalized}|${limitVal}|${geoCacheKey}`;
      const cached = getCached(cacheKey);
      if (cached !== null) {
        setItems(cached.slice(0, DISPLAY_LIMIT));
        setMeta({});
        setStatus("success");
        setError(undefined);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const rid = ++requestIdRef.current;
      setStatus("loading");

      try {
        const qp = new URLSearchParams({
          q: query.trim(),
          limit: String(limitVal),
        });
        if (geoRef.current) {
          qp.set("lat", geoRef.current.lat.toFixed(6));
          qp.set("lng", geoRef.current.lng.toFixed(6));
        }
        const url = `/api/search/suggest?${qp.toString()}`;
        const res = await fetch(url, { signal });
        if (signal.aborted) return;
        if (rid !== requestIdRef.current) return;
        if (!res.ok) {
          setItems([]);
          setStatus("error");
          setError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as unknown;
        if (signal.aborted || rid !== requestIdRef.current) return;
        const { items: parsedItems, meta: parsedMeta } = parseResponse(data);
        setCached(cacheKey, parsedItems);
        setItems(parsedItems.slice(0, DISPLAY_LIMIT));
        setMeta(parsedMeta);
        setStatus("success");
        setError(undefined);
      } catch (err) {
        if (signal.aborted || rid !== requestIdRef.current) return;
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
      const resetTimer = window.setTimeout(() => {
        setItems(TRENDING.slice(0, DISPLAY_LIMIT));
        setStatus("idle");
        setError(undefined);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    debounceRef.current = setTimeout(() => run(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, qNorm, run]);

  return useMemo(
    () => ({ items, status, error, queryNorm: qNorm, meta }),
    [items, status, error, qNorm, meta]
  );
}
