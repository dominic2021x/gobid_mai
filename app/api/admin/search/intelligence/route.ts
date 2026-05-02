/**
 * GET /api/admin/search/intelligence?q=...&limit=5
 * Admin-only. Returns unified intent, ranked suggestions preview, ranked listings preview, geo plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { buildUnifiedSearchPlan } from "@/lib/search/query/buildUnifiedSearchPlan";
import { rerankSuggestionsUnified } from "@/lib/search/ranking/suggestions/rerankSuggestions";
import { CANDIDATE_CAP_SUGGESTIONS } from "@/lib/search/ranking/core/constants";
import type { SuggestionCandidate } from "@/lib/search/suggestions/ranking";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

type RpcRow = {
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

function toCandidate(r: RpcRow): SuggestionCandidate {
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
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 5));
  const qNorm = normalizeRo(q);

  if (!qNorm || qNorm.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Query q required (min 2 chars)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const planRes = await buildUnifiedSearchPlan(qNorm, supabase, { channel: null });
  const intent = planRes.intent;
  const geoPlan = planRes.geoPlan;
  const profile = planRes.profile;

  const category = intent.categorySlug ?? null;
  const subcategory = intent.subcategorySlug ?? null;
  const countySlug = intent.location?.countyCode ?? null;
  const city = intent.location?.placeNameNorm ?? null;

  const rpcRes = await supabase.rpc("search_suggestions_candidates_rpc", {
    q_norm: qNorm,
    kind_filter: null,
    lim: CANDIDATE_CAP_SUGGESTIONS,
    category,
    subcategory,
    county: countySlug,
    city,
  });

  const rows = (rpcRes.data ?? []) as RpcRow[];
  const candidates = rows.map(toCandidate);
  const context = {
    query_norm: qNorm,
    category,
    subcategory,
    county: countySlug,
    city,
    channel: null as string | null,
  };
  const rankedSuggestions = rerankSuggestionsUnified(
    candidates,
    context,
    profile,
    undefined,
    limit
  );

  const suggestionsPreview = rankedSuggestions.map((r) => ({
    phrase: r.phrase,
    kind: r.kind,
    final_score: r.final_score,
    features: {
      lexical_relevance: r.features.lexical_relevance,
      context_boost: r.features.context_boost,
      ctr: r.features.ctr,
      quality_score: r.features.quality_score,
      exploration_boost: r.features.exploration_boost,
    },
  }));

  return NextResponse.json({
    ok: true,
    query: q,
    qNorm,
    intent: {
      queryNorm: intent.queryNorm,
      queryWithoutGeo: intent.queryWithoutGeo,
      categorySlug: intent.categorySlug,
      subcategorySlug: intent.subcategorySlug,
      vertical: intent.vertical,
      hasGeoIntent: !!(
        intent.location.countyId ||
        intent.location.placeId ||
        intent.location.countyCode ||
        (intent.location.matchedTokens?.length && intent.location.matchedTokens.length > 0)
      ),
      location: intent.location,
      isNavigational: intent.isNavigational,
    },
    profile: {
      vertical: profile.vertical,
      geoWeight: profile.geoWeight,
      useGeoTiering: profile.useGeoTiering,
    },
    geoPlan: geoPlan
      ? {
          hasGeoIntent: geoPlan.hasGeoIntent,
          tiers: geoPlan.tiers.map((t) => ({ tier: t.tier, label: t.label, order: t.order })),
        }
      : null,
    suggestionsPreview,
    listingsPreview: null,
  });
}
