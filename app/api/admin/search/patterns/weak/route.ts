/**
 * GET /api/admin/search/patterns/weak
 * Returns weak suggestions (high impressions + zero/low clicks), recent blacklist, and summary.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

const MIN_IMPRESSIONS = 20;
const LOW_CTR_THRESHOLD = 0.02;
const DAYS = 30;
const LIMIT_WEAK = 100;
const LIMIT_BLACKLIST = 50;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const qParam = req.nextUrl.searchParams.get("q")?.trim();
  const queryNorm = qParam ? normalizeRo(qParam) : null;

  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const statsSelect = queryNorm
    ? supabase
        .from("search_query_suggestion_stats")
        .select("suggestion_id, impressions, clicks")
        .eq("query_norm", queryNorm)
        .gte("day", sinceStr)
    : supabase
        .from("search_suggestion_daily_stats")
        .select("suggestion_id, impressions, clicks")
        .gte("day", sinceStr);

  const { data: statsRows, error: statsError } = await statsSelect;

  if (statsError) {
    return NextResponse.json(
      { ok: false, error: statsError.message },
      { status: 500 }
    );
  }

  const agg = new Map<
    string,
    { impressions: number; clicks: number }
  >();
  for (const r of (statsRows ?? []) as Array<{ suggestion_id: string; impressions: number; clicks: number }>) {
    const id = r.suggestion_id;
    const cur = agg.get(id) ?? { impressions: 0, clicks: 0 };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    agg.set(id, cur);
  }

  const zeroClickIds: string[] = [];
  const lowCtrIds: string[] = [];
  for (const [id, s] of agg) {
    if (s.impressions < MIN_IMPRESSIONS) continue;
    if (s.clicks === 0) zeroClickIds.push(id);
    else if (s.impressions > 0 && s.clicks / s.impressions < LOW_CTR_THRESHOLD) lowCtrIds.push(id);
  }

  const idsToFetch = [...zeroClickIds, ...lowCtrIds.filter((id) => !zeroClickIds.includes(id))].slice(0, LIMIT_WEAK);
  let weakSuggestions: Array<{
    id: string;
    phrase: string;
    phrase_norm: string;
    impressions: number;
    clicks: number;
    ctr: number;
    reason: "zero_clicks" | "low_ctr";
  }> = [];

  if (idsToFetch.length > 0) {
    const { data: suggRows, error: suggError } = await supabase
      .from("search_suggestions")
      .select("id, phrase, phrase_norm")
      .in("id", idsToFetch)
      .eq("kind", "query")
      .eq("is_public", true);

    if (!suggError && suggRows?.length) {
      const rows = suggRows as Array<{ id: string; phrase: string; phrase_norm: string }>;
      weakSuggestions = rows.map((r) => {
        const s = agg.get(r.id) ?? { impressions: 0, clicks: 0 };
        const ctr = s.impressions > 0 ? s.clicks / s.impressions : 0;
        return {
          id: r.id,
          phrase: r.phrase,
          phrase_norm: r.phrase_norm,
          impressions: s.impressions,
          clicks: s.clicks,
          ctr: Math.round(ctr * 10000) / 10000,
          reason: s.clicks === 0 ? "zero_clicks" : "low_ctr",
        };
      });
      weakSuggestions.sort((a, b) => b.impressions - a.impressions);
    }
  }

  const { data: blacklistRows } = await supabase
    .from("search_suggestions_blacklist")
    .select("phrase_norm, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT_BLACKLIST);

  const blacklistRecent = (blacklistRows ?? []) as Array<{
    phrase_norm: string;
    reason: string | null;
    created_at: string;
  }>;

  return NextResponse.json({
    ok: true,
    query_norm: queryNorm ?? undefined,
    weakSuggestions,
    blacklistRecent,
    summary: {
      totalZeroClick: zeroClickIds.length,
      totalLowCtr: lowCtrIds.length,
      days: DAYS,
      minImpressions: MIN_IMPRESSIONS,
      lowCtrThreshold: LOW_CTR_THRESHOLD,
    },
  });
}
