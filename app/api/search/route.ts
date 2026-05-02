import { NextRequest, NextResponse } from "next/server";
import { searchProductsFts, type ProductFtsFilters, FTS_QUERY_MAX_LENGTH } from "@/lib/search";
import type { SearchResult } from "@/lib/search/types";
import { runLegacySearch, type LegacySearchBody } from "@/lib/search/legacySearchApi";
import { buildQueryPipeline } from "@/lib/search/queryPipeline";
import {
  applyIntentBoosts,
  buildIntentExpandedQueries,
  parseSearchIntent,
} from "@/lib/search/intentParser";

/**
 * /api/search — subțire: filtre → `searchProductsFts` din `lib/search/fts.ts`,
 * apoi fallback `runLegacySearch` (motor existent `searchProducts` + RAG + sugestii).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_QUERY_LEN = FTS_QUERY_MAX_LENGTH;
const MAX_RESULTS = 20;

export type SearchFilters = ProductFtsFilters;

type SearchResponseBody = {
  success?: boolean;
  query: string;
  total: number;
  results: Array<{
    id: string;
    title: string;
    description: string;
    category?: string;
    price?: number;
    image?: string;
    url: string;
    score: number;
    type?: string;
    brand?: string;
    isSuggestion?: boolean;
    suggestionLabel?: string;
    rank?: number;
    subcategory?: string;
    city?: string | null;
    county?: string | null;
    productType?: string | null;
    updatedAt?: string | null;
    /** fts | ilike_fallback (din metadata căutare) */
    searchSource?: string;
    /** Fragment ts_headline (FTS) */
    snippet?: string;
    /** created_at produs (FTS) */
    productCreatedAt?: string | null;
  }>;
  hasSuggestions: boolean;
  error?: string;
  usedFts?: boolean;
  filters?: SearchFilters;
};

function clampPrice(n: unknown): number | undefined {
  if (n == null || n === "") return undefined;
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x < 0) return undefined;
  return Math.min(x, 1_000_000_000);
}

function normalizeQuery(raw: unknown): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_QUERY_LEN);
  if (trimmed.length === 0) return null;
  const normalized = buildQueryPipeline(trimmed, { expandSynonyms: true }).expandedTokens
    .join(" ")
    .slice(0, MAX_QUERY_LEN);
  return normalized.length > 0 ? normalized : null;
}

function normalizeFilterString(raw: unknown, maxLen: number): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().slice(0, maxLen);
  return t.length > 0 ? t : null;
}

function searchResultToApi(r: SearchResult): SearchResponseBody["results"][number] {
  const m = r.metadata ?? {};
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    price: r.price,
    image: r.image,
    url: r.url || "",
    score: r.score,
    rank: typeof m.fts_rank === "number" ? m.fts_rank : undefined,
    type: r.type,
    brand: m.brand as string | undefined,
    subcategory: m.subcategory as string | undefined,
    city: (m.city as string | null) ?? null,
    county: (m.county as string | null) ?? null,
    productType: (m.product_type as string | null) ?? null,
    updatedAt: (m.updated_at as string | null) ?? null,
    searchSource: typeof m.search_source === "string" ? m.search_source : undefined,
    snippet: typeof m.fts_snippet === "string" ? m.fts_snippet : undefined,
    productCreatedAt: (m.product_created_at as string | null | undefined) ?? undefined,
  };
}

function parseFilters(body: Record<string, unknown>): SearchFilters {
  const filters = body.filters;
  if (!filters || typeof filters !== "object") return {};
  const f = filters as Record<string, unknown>;
  return {
    minPrice: clampPrice(f.minPrice ?? f.min_price),
    maxPrice: clampPrice(f.maxPrice ?? f.max_price),
    city: normalizeFilterString(f.city, 120) ?? undefined,
    category: normalizeFilterString(f.category, 120) ?? undefined,
  };
}

async function runSearchHybrid(
  q: string,
  filters: SearchFilters,
  opts: { fallbackLegacy: boolean; limit: number; legacyFilters?: LegacySearchBody["filters"]; voice?: boolean },
): Promise<SearchResponseBody> {
  const intent = await parseSearchIntent(q);
  const expandedQueries = buildIntentExpandedQueries(intent).slice(0, 4);
  const ftsResults = await Promise.all(expandedQueries.map((query) => searchProductsFts(query, filters, MAX_RESULTS)));

  const dedup = new Map<string, SearchResult>();
  for (let i = 0; i < ftsResults.length; i++) {
    const list = ftsResults[i];
    const isOriginal = expandedQueries[i] === q;
    for (const row of list) {
      const current = dedup.get(row.id);
      const candidate = isOriginal ? { ...row, score: row.score + 0.05 } : row;
      if (!current || candidate.score > current.score) dedup.set(row.id, candidate);
    }
  }

  const boosted = applyIntentBoosts([...dedup.values()], intent)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);

  if (boosted.length > 0) {
    return {
      success: true,
      query: q,
      total: boosted.length,
      results: boosted.map(searchResultToApi),
      hasSuggestions: false,
      usedFts: true,
      filters,
    };
  }

  if (opts.fallbackLegacy) {
    const legacy = await runLegacySearch({
      query: q,
      limit: opts.limit,
      filters: opts.legacyFilters,
      voice: opts.voice,
    });
    return {
      success: true,
      query: legacy.query,
      total: legacy.total,
      results: legacy.results,
      hasSuggestions: legacy.hasSuggestions,
      usedFts: false,
      filters,
    };
  }

  return {
    success: true,
    query: q,
    total: 0,
    results: [],
    hasSuggestions: false,
    usedFts: true,
    filters,
  };
}

function jsonResponse(body: SearchResponseBody, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = normalizeQuery(searchParams.get("q") ?? searchParams.get("query"));
  if (!q) {
    return jsonResponse(
      { error: 'Missing query parameter "q" or "query".', results: [], total: 0, query: "", hasSuggestions: false },
      400,
    );
  }

  const fallbackLegacy =
    searchParams.get("fallback") !== "0" && searchParams.get("legacy") !== "only";

  const filters: SearchFilters = {
    minPrice: clampPrice(searchParams.get("minPrice") ?? searchParams.get("min_price")),
    maxPrice: clampPrice(searchParams.get("maxPrice") ?? searchParams.get("max_price")),
    city: normalizeFilterString(searchParams.get("city"), 120) ?? undefined,
    category: normalizeFilterString(searchParams.get("category"), 120) ?? undefined,
  };

  const out = await runSearchHybrid(q, filters, { fallbackLegacy, limit: MAX_RESULTS });
  const status = out.success === false && out.error?.includes("unavailable") ? 503 : out.success === false ? 500 : 200;
  return jsonResponse(out, status);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body.", results: [], total: 0, query: "", hasSuggestions: false }, 400);
  }

  const q = normalizeQuery(body.query ?? body.q);
  if (!q) {
    return jsonResponse(
      { error: 'Field "query" (or "q") is required.', results: [], total: 0, query: "", hasSuggestions: false },
      400,
    );
  }

  const filters = parseFilters(body);
  const fallbackLegacy = body.fallbackLegacy !== false && body.legacy !== "only";
  const limitRaw = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

  const bf = body.filters as LegacySearchBody["filters"] | undefined;
  const out = await runSearchHybrid(q, filters, {
    fallbackLegacy,
    limit,
    legacyFilters: {
      category: filters.category ?? bf?.category,
      brand: bf?.brand,
      minPrice: filters.minPrice ?? bf?.minPrice,
      maxPrice: filters.maxPrice ?? bf?.maxPrice,
    },
    voice: body.voice === true,
  });

  const status = out.success === false && out.error?.includes("unavailable") ? 503 : out.success === false ? 500 : 200;
  return jsonResponse(out, status);
}
