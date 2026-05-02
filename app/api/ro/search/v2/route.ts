import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildQueryFromParams } from "@/lib/listings/filters";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import { normalizeQuery, validateQueryLength } from "@/lib/search/v2/normalize";
import { rewriteQuery } from "@/lib/search/v2/rewrite";
import { buildCacheKey, getCached, setCached } from "@/lib/search/v2/cache";
import { detectIntent } from "@/lib/search/v2/intent";
import { retrieveLexical, LEXICAL_CAP } from "@/lib/search/v2/retrieveLexical";
import { getSemanticNodeScores } from "@/lib/search/v2/retrieveSemantic";
import { applyGraphBoost } from "@/lib/search/v2/graphBoost";
import { rerank } from "@/lib/search/v2/rerank";
import { diversify } from "@/lib/search/v2/diversify";
import { getFacetCounts } from "@/lib/search/v2/facets";
import { getWeightsForBucket } from "@/lib/search/v2/weights";
import { applyQueryBoosts, getIntentBucket } from "@/lib/search/v2/intelligence";
import { loadUserProfile, applyPersonalization } from "@/lib/search/v2/personalization";
import { buildSearchPlan } from "@/lib/search/query/buildSearchPlan";
import { buildUnifiedSearchPlan } from "@/lib/search/query/buildUnifiedSearchPlan";
import { rerankListingResults } from "@/lib/search/listings/rerankListingResults";
import { rerankListingsUnified } from "@/lib/search/ranking/listings/rerankListings";
import { isUnifiedScoringEnabled } from "@/lib/search/ranking/core/featureFlags";
import { getTierOrderForListing } from "@/lib/search/listings/getTierOrderForListing";
import type { ListingGeoRow } from "@/lib/search/listings/types";
import type { SearchV2Response, SearchFacets, SearchCandidate } from "@/lib/search/v2/types";
import { getCachedMarketplaceTaxonomy } from "@/lib/search/patterns/cache/getCachedMarketplaceTaxonomy";
import { getAutocorrectResult, MIN_CONFIDENCE_FALLBACK } from "@/lib/search/autocorrect";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 0;

const PAGE_SIZE = 30;
const SUGGESTIONS_CAP = 12;
const HEALTH_SAMPLES_WINDOW = 100;
/** Max candidates to fetch listing_geo for (bounded for serverless). */
const GEO_CANDIDATE_CAP = 150;

function dedupeCandidates<T extends { id: string }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  }) as T[];
}

async function writeHealthSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  cacheHit: boolean,
  latencyMs: number,
  candidateCount: number
): Promise<void> {
  try {
    await supabase.from("search_health_samples").insert({
      cache_hit: cacheHit,
      latency_ms: latencyMs,
      candidate_count: candidateCount,
    });
    const { data: samples } = await supabase
      .from("search_health_samples")
      .select("cache_hit, latency_ms, candidate_count")
      .order("created_at", { ascending: false })
      .limit(HEALTH_SAMPLES_WINDOW);
    const arr = samples ?? [];
    const n = arr.length;
    if (n === 0) return;
    const hits = arr.filter((s: { cache_hit: boolean }) => s.cache_hit).length;
    const avgLatency = arr.reduce((a: number, s: { latency_ms: number }) => a + s.latency_ms, 0) / n;
    const avgCandidates = arr.reduce((a: number, s: { candidate_count: number }) => a + s.candidate_count, 0) / n;
    await supabase.from("growth_google_snapshots").insert({
      product: "search",
      kind: "health",
      scope_ref: "default",
      result: {
        latencyMs: Math.round(avgLatency),
        cacheHitRatio: n > 0 ? hits / n : 0,
        candidateCount: Math.round(avgCandidates),
        sampleSize: n,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {
    // non-fatal
  }
}

export async function GET(req: NextRequest) {
  const requestStart = Date.now();
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  let qNorm = normalizeQuery(rawQ);
  qNorm = rewriteQuery(qNorm);

  if (!validateQueryLength(qNorm)) {
    return NextResponse.json(
      { results: [], facets: { category: [], county: [] }, suggestions: [], meta: { cacheHit: false } } as SearchV2Response,
      { status: 200 }
    );
  }

  const supabase = createAdminClient();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const { query } = buildQueryFromParams(searchParams);
  const filters: Record<string, unknown> = {};
  if (query.categorie) filters.categorie = query.categorie;
  if (query.county) filters.county = query.county;
  if (query.subcategorie) filters.subcategorie = query.subcategorie;

  const cacheKey = buildCacheKey(qNorm, filters, page);
  const cached = await getCached(supabase, cacheKey);
  if (cached) {
    const latencyMs = Date.now() - requestStart;
    const metaCached = cached.meta as { totalCandidates?: number } | undefined;
    await writeHealthSnapshot(supabase, true, latencyMs, metaCached?.totalCandidates ?? 0);
    const res = NextResponse.json({ ...cached, meta: { ...(cached.meta as object), cacheHit: true } } as SearchV2Response);
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  }

  const timing: Record<string, number> = {};
  let t0 = Date.now();
  const useUnified = isUnifiedScoringEnabled();
  const [detectedIntent, plan, unifiedPlan] = await Promise.all([
    detectIntent(supabase, qNorm),
    buildSearchPlan(qNorm, supabase),
    useUnified ? buildUnifiedSearchPlan(qNorm, supabase, { page }) : Promise.resolve(null),
  ]);
  timing.intent = Date.now() - t0;

  let intent = detectedIntent;
  if (useUnified && unifiedPlan?.intent) {
    const ui = unifiedPlan.intent;
    intent = {
      ...intent,
      categorySlug: ui.categorySlug ?? intent.categorySlug,
      countySlug: intent.countySlug,
      forcedFilters: {
        ...intent.forcedFilters,
        ...(ui.categorySlug && { categorie: ui.categorySlug }),
        ...(ui.subcategorySlug && { subcategorie: ui.subcategorySlug }),
      },
    };
  }

  const useGeo = plan.geoPlan?.hasGeoIntent ?? false;

  const bucket = getIntentBucket(intent.intent, intent.categorySlug, intent.countySlug);
  const { data: armRow } = await supabase
    .from("search_intel_arms")
    .select("arm")
    .eq("bucket", bucket)
    .order("impressions", { ascending: false })
    .limit(1)
    .maybeSingle();
  const arm = (armRow as { arm?: string } | null)?.arm ?? "mix_a";
  const weights = await getWeightsForBucket(supabase, bucket);

  const mergedQuery: ProductQuery = {
    ...query,
    q: rawQ || query.q,
    from: 0,
    limit: LEXICAL_CAP,
    ...intent.forcedFilters,
  };

  t0 = Date.now();
  const access = await resolveAccess(req);
  let candidates = await retrieveLexical(mergedQuery, access);
  timing.lexical = Date.now() - t0;

  t0 = Date.now();
  const semanticNodeScores = await getSemanticNodeScores(supabase, qNorm);
  timing.semantic = Date.now() - t0;

  t0 = Date.now();
  candidates = await applyGraphBoost(supabase, qNorm, candidates, semanticNodeScores);
  timing.graphBoost = Date.now() - t0;

  candidates = dedupeCandidates(candidates);

  candidates = await applyQueryBoosts(supabase, qNorm, candidates);
  t0 = Date.now();
  if (useGeo && plan.geoPlan && plan.geoPlan.tiers.length > 0) {
    const cappedIds = candidates.slice(0, GEO_CANDIDATE_CAP).map((c) => c.id);
    const { data: geoRows } = await supabase
      .from("listing_geo")
      .select("listing_id, county_id, place_id, parent_place_id, lat, lng, geo_quality")
      .in("listing_id", cappedIds);
    const geoByListingId = new Map<string, ListingGeoRow>();
    for (const row of geoRows ?? []) {
      const r = row as { listing_id: string; county_id: string | null; place_id: string | null; parent_place_id: string | null; lat: number | null; lng: number | null; geo_quality: string };
      geoByListingId.set(r.listing_id, { listing_id: r.listing_id, county_id: r.county_id, place_id: r.place_id, parent_place_id: r.parent_place_id, lat: r.lat, lng: r.lng, geo_quality: r.geo_quality });
    }
    const geoContext = {
      countyId: plan.geoPlan.parsedLocation.countyId ?? null,
      placeId: plan.geoPlan.parsedLocation.placeId ?? null,
      tiers: plan.geoPlan.tiers,
    };
    const baseScores = new Map<string, number>();
    for (const c of candidates) baseScores.set(c.id, c.score);
    const candidatesWithGeo = candidates.slice(0, GEO_CANDIDATE_CAP).map((c) => ({
      id: c.id,
      item: c.item,
      geo: geoByListingId.get(c.id) ?? null,
      tierOrder: getTierOrderForListing(geoByListingId.get(c.id) ?? null, plan.geoPlan!.tiers),
      baseScore: c.score,
    }));
    const rerankContext = {
      queryNorm: qNorm,
      categorySlug: intent.categorySlug ?? null,
      subcategorySlug: plan.filters.subcategory ?? null,
      geo: geoContext,
    };
    const ranked = useUnified && unifiedPlan
      ? rerankListingsUnified(candidatesWithGeo, rerankContext, unifiedPlan.profile, GEO_CANDIDATE_CAP)
      : rerankListingResults(candidatesWithGeo, {
          queryNorm: qNorm,
          categorySlug: intent.categorySlug ?? null,
          subcategorySlug: plan.filters.subcategory ?? null,
          geo: geoContext,
          baseScores,
        }, GEO_CANDIDATE_CAP);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const ordered = ranked.map((r) => {
      const orig = byId.get(r.id);
      return orig ? { ...orig, score: r.finalScore } : ({ id: r.id, item: r.item, score: r.finalScore } as SearchCandidate);
    });
    const tail = candidates.slice(GEO_CANDIDATE_CAP);
    candidates = [...ordered, ...tail];
  } else {
    candidates = rerank(candidates, weights);
  }
  candidates = diversify(candidates, { disableCountyDiversification: !!intent.countySlug });
  timing.rerank = Date.now() - t0;

  let userId: string | null = null;
  try {
    const serverSupabase = await import("@/lib/supabase/server").then((m) => m.createServerClient());
    const { data: { user } } = await serverSupabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (userId) {
    const [optRow, prefs] = await Promise.all([
      supabase.from("search_personal_opt_in").select("enabled").eq("user_id", userId).maybeSingle(),
      loadUserProfile(supabase, userId),
    ]);
    const enabled = (optRow.data as { enabled?: boolean } | null)?.enabled ?? false;
    if (enabled && prefs) {
      candidates = applyPersonalization(candidates, prefs);
      candidates = candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const pageItems = candidates.slice(from, from + PAGE_SIZE);
  let results: Record<string, unknown>[] = pageItems.map((c) => c.item);

  const impressionId = crypto.randomUUID();
  const impressionResults = candidates.slice(0, PAGE_SIZE).map((c, i) => ({
    id: c.id,
    pos: i,
    ...(c.lexScore != null && { lex: c.lexScore }),
    ...(c.semScore != null && { sem: c.semScore }),
    ...(c.graphScore != null && { graph: c.graphScore }),
    ...(c.freshnessScore != null && { fresh: c.freshnessScore }),
  }));
  try {
    await supabase.from("search_impressions").insert({
      impression_id: impressionId,
      q_norm: qNorm,
      intent_bucket: bucket,
      arm,
      results: impressionResults,
      ...(userId && { user_id: userId }),
    });
  } catch {
    // non-fatal
  }

  t0 = Date.now();
  const [facets, queriesRes, nodesRes] = await Promise.all([
    getFacetCounts(supabase, { categorie: mergedQuery.categorie, county: mergedQuery.county }),
    supabase.from("graph_queries").select("q_norm, score").ilike("q_norm", `${qNorm}%`).order("score", { ascending: false }).limit(SUGGESTIONS_CAP),
    supabase.from("graph_nodes").select("label, popularity").ilike("label", `${qNorm}%`).order("popularity", { ascending: false }).limit(SUGGESTIONS_CAP),
  ]);
  timing.facets = Date.now() - t0;

  const suggestions: Array<{ text: string; score?: number }> = [];
  const seen = new Set<string>();
  for (const r of queriesRes.data ?? []) {
    const q = (r as { q_norm: string; score?: number }).q_norm;
    if (q && !seen.has(q)) {
      seen.add(q);
      suggestions.push({ text: q, score: (r as { score?: number }).score });
    }
  }
  for (const r of nodesRes.data ?? []) {
    const label = (r as { label: string }).label;
    if (label && !seen.has(label)) {
      seen.add(label);
      suggestions.push({ text: label, score: (r as { popularity?: number }).popularity });
    }
  }
  const suggestionsFinal = suggestions.slice(0, SUGGESTIONS_CAP);

  const meta: SearchV2Response["meta"] = {
    cacheHit: false,
    totalCandidates: candidates.length,
    timing,
    impressionId,
    bucket,
    arm,
  };

  if (results.length === 0 && page === 1) {
    try {
      const taxonomy = await getCachedMarketplaceTaxonomy(supabase);
      const autocorrect = getAutocorrectResult(qNorm, taxonomy);
      if (autocorrect.didYouMean) meta.didYouMean = autocorrect.didYouMean;
      if (
        autocorrect.correctedNorm &&
        autocorrect.confidence >= MIN_CONFIDENCE_FALLBACK
      ) {
        const intentCorrected = await detectIntent(supabase, autocorrect.correctedNorm);
        const planCorrected = await buildSearchPlan(autocorrect.correctedNorm, supabase);
        const mergedCorrected: ProductQuery = {
          ...query,
          q: autocorrect.correctedNorm,
          from: 0,
          limit: LEXICAL_CAP,
          ...intentCorrected.forcedFilters,
        };
        let candidatesCorrected = await retrieveLexical(mergedCorrected, access);
        const semanticCorrected = await getSemanticNodeScores(supabase, autocorrect.correctedNorm);
        candidatesCorrected = await applyGraphBoost(
          supabase,
          autocorrect.correctedNorm,
          candidatesCorrected,
          semanticCorrected
        );
        candidatesCorrected = dedupeCandidates(candidatesCorrected);
        candidatesCorrected = await applyQueryBoosts(supabase, autocorrect.correctedNorm, candidatesCorrected);
        candidatesCorrected = rerank(candidatesCorrected, weights);
        candidatesCorrected = diversify(candidatesCorrected, {
          disableCountyDiversification: !!intentCorrected.countySlug,
        });
        const fallbackResults = candidatesCorrected
          .slice(0, PAGE_SIZE)
          .map((c) => c.item);
        if (fallbackResults.length > 0) {
          results = fallbackResults;
          meta.correctedQueryUsed = true;
        }
      }
    } catch {
      // non-fatal
    }
  }

  const debugHeader = req.headers.get("x-debug");
  if (debugHeader === "1") {
    try {
      await requireAdmin(req);
      await supabase.from("search_explain_logs").insert({
        q_norm: qNorm,
        intent: intent.intent,
        filters: intent.forcedFilters,
        timing,
        top_signals: { lexCount: candidates.length, semanticNodes: semanticNodeScores.size },
      });
    } catch {
      // not admin, skip log
    }
  }

  const response: SearchV2Response = {
    results,
    facets,
    suggestions: suggestionsFinal,
    meta,
  };

  if (!meta.correctedQueryUsed) {
    await setCached(supabase, cacheKey, response as unknown as Record<string, unknown>);
  }

  const latencyMs = Date.now() - requestStart;
  await writeHealthSnapshot(supabase, false, latencyMs, candidates.length);

  const res = NextResponse.json(response);
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
}
