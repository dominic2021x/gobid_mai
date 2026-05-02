/**
 * Postgres FTS pe `products.search_vector` (RPC `search_products_fts`).
 * Folosit de SupabaseSearchEngine și de `/api/search` când sunt filtre HTTP.
 */

import { supabaseAdmin } from "@/lib/supabase";
import type { SearchResult } from "./types";

const SEARCH_LOG_TAG = "[gobid-search]";

/** Aliniat cu SQL: left(btrim(p_query), 120). */
export const FTS_QUERY_MAX_LENGTH = 120;

const DURATION_SAMPLE_CAP = 500;
const durationSamplesMs: number[] = [];

function recordDurationSample(ms: number): void {
  durationSamplesMs.push(ms);
  if (durationSamplesMs.length > DURATION_SAMPLE_CAP) {
    durationSamplesMs.splice(0, durationSamplesMs.length - DURATION_SAMPLE_CAP);
  }
}

function percentileNearestRank(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

/** Percentile pe ultimele durate înregistrate (aproximare în proces, util pentru loguri). */
export function getSearchDurationPercentilesMs(): { p95Ms: number | null; p99Ms: number | null } {
  if (durationSamplesMs.length === 0) return { p95Ms: null, p99Ms: null };
  const sorted = [...durationSamplesMs].sort((a, b) => a - b);
  return {
    p95Ms: percentileNearestRank(sorted, 95),
    p99Ms: percentileNearestRank(sorted, 99),
  };
}

/** Logging: query, resultsCount, sursă, durationMs + p95/p99 pe eșantion recent. */
export function logProductSearch(event: {
  query: string;
  resultsCount: number;
  source: "fts" | "ilike_fallback";
  durationMs: number;
}): void {
  recordDurationSample(event.durationMs);
  const { p95Ms, p99Ms } = getSearchDurationPercentilesMs();
  const q =
    event.query.length > FTS_QUERY_MAX_LENGTH
      ? `${event.query.slice(0, FTS_QUERY_MAX_LENGTH)}…`
      : event.query;
  console.info(
    SEARCH_LOG_TAG,
    JSON.stringify({
      query: q,
      resultsCount: event.resultsCount,
      source: event.source,
      durationMs: event.durationMs,
      p95Ms,
      p99Ms,
      samplesCount: durationSamplesMs.length,
    }),
  );
}

export type ProductFtsFilters = {
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  category?: string;
};

type FtsRow = {
  id: string;
  rank: number;
  snippet: string | null;
  title: string;
  slug: string | null;
  description: string | null;
  category: string;
  subcategory: string;
  starting_price_ron: number | null;
  city: string | null;
  county: string | null;
  images: unknown;
  product_type: string | null;
  status: string | null;
  url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function firstImageUrl(images: unknown): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const first = images[0];
  if (typeof first === "string" && first.startsWith("http")) return first;
  if (first && typeof first === "object" && "url" in first && typeof (first as { url: string }).url === "string") {
    return (first as { url: string }).url;
  }
  return undefined;
}

/** Aliniat cu rutele de listare din app (licitații vs live bid). */
export function buildProductListingPath(row: {
  id: string;
  slug: string | null;
  product_type: string | null;
  url: string | null;
}): string {
  if (row.url && String(row.url).trim().startsWith("/")) return String(row.url).trim();
  const slug = row.slug?.trim();
  if (row.product_type === "licitatii-publice" && slug) return `/licitatii-publice/${slug}`;
  if (slug) return `/live_bid/${slug}`;
  return `/live_bid/${row.id}`;
}

function rowToSearchResult(row: FtsRow): SearchResult {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    price: row.starting_price_ron != null ? Number(row.starting_price_ron) : undefined,
    image: firstImageUrl(row.images),
    url: buildProductListingPath(row),
    score: Math.min(1, Math.max(0, Number(row.rank) || 0)),
    type: "product",
    metadata: {
      subcategory: row.subcategory,
      city: row.city,
      county: row.county,
      product_type: row.product_type,
      fts_rank: row.rank,
      fts_snippet: row.snippet ?? undefined,
      product_created_at: row.created_at,
      updated_at: row.updated_at,
      search_source: "fts" as const,
    },
  };
}

/**
 * Căutare FTS cu filtre opționale (preț, oraș, categorie). Max 20 în SQL.
 * Query trunchiat la FTS_QUERY_MAX_LENGTH înainte de RPC (server-side SQL face același lucru).
 */
export async function searchProductsFts(
  query: string,
  filters: ProductFtsFilters,
  limit: number,
): Promise<SearchResult[]> {
  if (!supabaseAdmin || !query.trim()) {
    return [];
  }

  const trimmed = query.trim().slice(0, FTS_QUERY_MAX_LENGTH);
  const cap = Math.min(Math.max(limit, 1), 20);
  const t0 = Date.now();

  const { data, error } = await supabaseAdmin.rpc("search_products_fts", {
    p_query: trimmed,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_city: filters.city ?? null,
    p_category: filters.category ?? null,
    p_limit: cap,
  });

  const durationMs = Date.now() - t0;

  if (error) {
    console.error("[searchProductsFts]", error);
    logProductSearch({ query: trimmed, resultsCount: 0, source: "fts", durationMs });
    return [];
  }

  const rows = ((data ?? []) as FtsRow[]).map(rowToSearchResult);
  logProductSearch({ query: trimmed, resultsCount: rows.length, source: "fts", durationMs });
  return rows;
}
