/**
 * GET /api/ro/search/suggest – sugestii instant (fără LLM), deterministe, cu reranking.
 * Fetch 50 candidates via search_suggestions_candidates_rpc, rerank in Node, return top 8–10.
 * La submit (Enter / click Search), folosește POST /api/ro/search/track cu { q } pentru popularity.
 * Telemetry: POST /api/ro/search/suggest/track pentru impression/click/submit.
 *
 * Test manual: ?q=ap+2+cam | ?q=spatiu+comercial | ?q=teren+extravilan
 * Context: ?q=teren&category=imobiliare | ?q=apartament&county=Dolj
 */

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";
import { checkSuggestRateLimit } from "@/lib/search/suggestRateLimit";
import { getGeoSuggestions } from "@/lib/search/geo/getGeoSuggestions";
import { normalizeLocation } from "@/lib/search/geo/normalizeLocation";
import { rerankSuggestions } from "@/lib/search/suggestions/ranking";
import type { RankedSuggestion, SuggestionCandidate } from "@/lib/search/suggestions/ranking";
import { filterSuggestionCandidate } from "@/lib/search/suggestions/quality/filterSuggestion";
import { getCachedMarketplaceTaxonomy } from "@/lib/search/patterns/cache/getCachedMarketplaceTaxonomy";
import { getCachedPatternRules } from "@/lib/search/patterns/cache/getCachedPatternRules";
import { getProfileForSubcategory } from "@/lib/search/patterns/profiles/getProfileForSubcategory";
import { fetchSuggestionStatsMap } from "@/lib/search/suggestions/fetchSuggestionStats";
import { fetchQuerySuggestionStats } from "@/lib/search/suggestions/fetchQuerySuggestionStats";
import { isUnifiedScoringEnabled } from "@/lib/search/ranking/core/featureFlags";
import { buildUnifiedSearchPlan } from "@/lib/search/query/buildUnifiedSearchPlan";
import { rerankSuggestionsUnified } from "@/lib/search/ranking/suggestions/rerankSuggestions";
import { getAutocorrectResult } from "@/lib/search/autocorrect";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const SUGGEST_CACHE = "public, s-maxage=15, stale-while-revalidate=60";
const CANDIDATES_FETCH_LIMIT = 50;
const DISPLAY_TOP_K = 10;

const FALLBACK_PHRASES = [
  "Apartamente",
  "Autoturisme",
  "Piese auto",
  "Terenuri",
  "Spațiu comercial",
];

const optionalContextString = z
  .string()
  .max(100)
  .optional()
  .transform((s) => (s != null && s !== "" ? s.trim() : undefined));

const SuggestQuerySchema = z.object({
  q: z.string().min(1).max(80).transform((s) => s.trim()),
  kind: z
    .enum(["query", "category", "subcategory", "county", "city", "brand", "attribute"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  category: optionalContextString,
  subcategory: optionalContextString,
  county: optionalContextString,
  city: optionalContextString,
});

export type SuggestItem = {
  phrase: string;
  phrase_norm?: string;
  kind: string;
  popularity: number;
  meta: Record<string, unknown>;
};

type CandidatesRpcRow = {
  id: string;
  phrase: string;
  phrase_norm: string;
  kind: string;
  popularity: number;
  meta: unknown;
  source_priority: number;
  frequency_count: number;
  last_seen_at: string | null;
  quality_score: number;
  rank_score: number;
  channel: string | null;
  category_key: string | null;
};

function fallbackItems(): SuggestItem[] {
  return FALLBACK_PHRASES.map((phrase) => ({
    phrase,
    kind: "query",
    popularity: 0,
    meta: {},
  }));
}

function mapRpcRowToCandidate(r: CandidatesRpcRow): SuggestionCandidate {
  return {
    id: r.id,
    phrase: r.phrase,
    phrase_norm: r.phrase_norm,
    kind: r.kind,
    popularity: r.popularity,
    meta: (r.meta as Record<string, unknown>) ?? {},
    source_priority: r.source_priority ?? 0,
    frequency_count: r.frequency_count ?? 0,
    last_seen_at: r.last_seen_at ?? null,
    quality_score: Number(r.quality_score) ?? 0,
    rank_score: Number(r.rank_score) ?? 0,
    channel: r.channel ?? null,
    category_key: r.category_key ?? null,
  };
}

export async function GET(req: NextRequest) {
  const rid = randomUUID();
  const startTime = Date.now();

  const { allowed: rateLimitAllowed } = checkSuggestRateLimit(req);
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests", items: fallbackItems() },
      { status: 429, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const parsed = SuggestQuerySchema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? "",
    kind: req.nextUrl.searchParams.get("kind") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? 10,
    category: req.nextUrl.searchParams.get("category") ?? undefined,
    subcategory: req.nextUrl.searchParams.get("subcategory") ?? undefined,
    county: req.nextUrl.searchParams.get("county") ?? undefined,
    city: req.nextUrl.searchParams.get("city") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { q, kind, limit, category, subcategory, county, city } = parsed.data;
  const displayLimit = Math.min(Math.max(limit, 5), DISPLAY_TOP_K);
  const qNorm = normalizeRo(q);

  if (!qNorm || q.trim().length < 2) {
    const items = fallbackItems();
    if (process.env.NODE_ENV === "development") {
      console.info(JSON.stringify({ rid, q: q.slice(0, 50), limit: displayLimit, count: items.length }));
    }
    return NextResponse.json(
      { ok: true, q, qNorm: qNorm ?? "", items },
      { headers: { "Cache-Control": SUGGEST_CACHE, "X-Request-Id": rid } }
    );
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("search_suggestions_candidates_rpc", {
      q_norm: qNorm,
      kind_filter: kind ?? null,
      lim: CANDIDATES_FETCH_LIMIT,
      category: category ?? null,
      subcategory: subcategory ?? null,
      county: county ?? null,
      city: city ?? null,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(JSON.stringify({ rid, q: q.slice(0, 50), error: error.message }));
      }
      const items = fallbackItems();
      return NextResponse.json(
        { ok: true, q, qNorm, items },
        { headers: { "Cache-Control": SUGGEST_CACHE, "X-Request-Id": rid } }
      );
    }

    const rows = (data ?? []) as CandidatesRpcRow[];
    let candidates = rows.map(mapRpcRowToCandidate);

    const [taxonomy, rules] = await Promise.all([
      getCachedMarketplaceTaxonomy(supabase),
      getCachedPatternRules(supabase),
    ]);
    const patternProfile = getProfileForSubcategory(category ?? null, subcategory ?? null);

    const autocorrect = getAutocorrectResult(qNorm, taxonomy);

    const geoItems = await getGeoSuggestions(supabase, qNorm, 8);
    const phraseNormSeen = new Set(candidates.map((c) => c.phrase_norm));
    for (const g of geoItems) {
      const phraseNorm = normalizeLocation(g.phrase).trim();
      if (!phraseNorm || phraseNormSeen.has(phraseNorm)) continue;
      phraseNormSeen.add(phraseNorm);
      candidates.push({
        id: `geo-${g.kind}-${g.meta.countyId ?? g.meta.placeId ?? phraseNorm}`,
        phrase: g.phrase,
        phrase_norm: phraseNorm,
        kind: g.kind,
        popularity: 0,
        meta: g.meta as Record<string, unknown>,
        source_priority: 1,
        frequency_count: 0,
        last_seen_at: null,
        quality_score: 0.5,
        rank_score: 0.5,
        channel: null,
        category_key: null,
      } as SuggestionCandidate);
    }

    if (autocorrect.correctedNorm && autocorrect.correctedNorm !== qNorm && autocorrect.confidence >= 0.75) {
      const { data: dataCorrected } = await supabase.rpc("search_suggestions_candidates_rpc", {
        q_norm: autocorrect.correctedNorm,
        kind_filter: kind ?? null,
        lim: CANDIDATES_FETCH_LIMIT,
        category: category ?? null,
        subcategory: subcategory ?? null,
        county: county ?? null,
        city: city ?? null,
      });
      const rowsCorrected = (dataCorrected ?? []) as CandidatesRpcRow[];
      const seenNorm = new Set(candidates.map((c) => c.phrase_norm));
      for (const r of rowsCorrected) {
        const phraseNorm = (r.phrase_norm ?? "").trim().toLowerCase();
        if (!phraseNorm || seenNorm.has(phraseNorm)) continue;
        seenNorm.add(phraseNorm);
        candidates.push(mapRpcRowToCandidate(r));
      }
    }

    candidates = candidates.filter((c) => {
      const norm = c.phrase_norm.trim().toLowerCase();
      if (!norm.startsWith(qNorm) && !(autocorrect.correctedNorm && norm.startsWith(autocorrect.correctedNorm))) return false;
      return filterSuggestionCandidate(c, {
        taxonomy,
        profile: patternProfile,
        blacklist: rules.blacklist,
        whitelist: rules.whitelist,
      }).keep;
    });

    const candidateIds = candidates.map((c) => c.id).filter((id) => id.length === 36);
    const [statsMap, queryAffinityMap] = await Promise.all([
      fetchSuggestionStatsMap(supabase, candidateIds),
      fetchQuerySuggestionStats(supabase, qNorm, candidateIds),
    ]);

    const context = {
      query_norm: qNorm,
      category: category ?? null,
      subcategory: subcategory ?? null,
      county: county ?? null,
      city: city ?? null,
      channel: null,
    };
    let ranked: RankedSuggestion[];
    if (isUnifiedScoringEnabled()) {
      const unifiedPlan = await buildUnifiedSearchPlan(qNorm, supabase, { channel: null });
      ranked = rerankSuggestionsUnified(
        candidates,
        context,
        unifiedPlan.profile,
        statsMap,
        displayLimit,
        taxonomy,
        patternProfile,
        queryAffinityMap
      );
    } else {
      ranked = rerankSuggestions(candidates, context, undefined, displayLimit);
    }
    const items: SuggestItem[] =
      ranked.length > 0
        ? ranked.map((r) => ({
            phrase: r.phrase,
            phrase_norm: r.phrase_norm,
            kind: r.kind,
            popularity: r.popularity,
            meta: r.meta,
          }))
        : fallbackItems();

    if (process.env.NODE_ENV === "development") {
      console.info(JSON.stringify({ rid, q: q.slice(0, 50), limit: displayLimit, count: items.length }));
    }

    const meta: { count: number; didYouMean?: string } = { count: items.length };
    if (autocorrect.didYouMean) meta.didYouMean = autocorrect.didYouMean;

    return NextResponse.json(
      { ok: true, q, qNorm, items, meta },
      { headers: { "Cache-Control": SUGGEST_CACHE, "X-Request-Id": rid } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.error(JSON.stringify({ rid, q: q.slice(0, 50), error: msg }));
    }
    return NextResponse.json(
      { ok: true, q, qNorm, items: fallbackItems(), error: msg },
      { status: 200, headers: { "Cache-Control": SUGGEST_CACHE, "X-Request-Id": rid } }
    );
  }
}
