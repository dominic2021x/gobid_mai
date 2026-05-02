/**
 * GET /api/admin/search/patterns/affinity?q=...
 * For a given query prefix, return top suggestions by query-to-suggestion affinity (CTR from search_query_suggestion_stats).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const LIMIT = 50;
const DAYS = 30;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const qNorm = normalizeRo(q);
  if (!qNorm || qNorm.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Query q required (min 2 chars)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: statsRows, error: statsError } = await supabase
    .from("search_query_suggestion_stats")
    .select("suggestion_id, impressions, clicks")
    .eq("query_norm", qNorm)
    .gte("day", sinceStr);

  if (statsError) {
    return NextResponse.json({ ok: false, error: statsError.message }, { status: 500 });
  }

  const agg = new Map<string, { impressions: number; clicks: number }>();
  for (const r of (statsRows ?? []) as Array<{ suggestion_id: string; impressions: number; clicks: number }>) {
    const id = r.suggestion_id;
    const cur = agg.get(id) ?? { impressions: 0, clicks: 0 };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    agg.set(id, cur);
  }

  const ids = [...agg.keys()].slice(0, LIMIT);
  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      query_norm: qNorm,
      affinity: [],
      count: 0,
    });
  }

  const { data: suggRows, error: suggError } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm")
    .in("id", ids);

  if (suggError) {
    return NextResponse.json({ ok: false, error: suggError.message }, { status: 500 });
  }

  const affinity = (suggRows ?? []).map((s: { id: string; phrase: string; phrase_norm: string }) => {
    const st = agg.get(s.id) ?? { impressions: 0, clicks: 0 };
    const ctr = st.impressions > 0 ? st.clicks / st.impressions : 0;
    return {
      suggestion_id: s.id,
      phrase: s.phrase,
      phrase_norm: s.phrase_norm,
      impressions: st.impressions,
      clicks: st.clicks,
      ctr: Math.round(ctr * 10000) / 10000,
    };
  });
  affinity.sort((a, b) => b.ctr - a.ctr);

  return NextResponse.json({
    ok: true,
    query_norm: qNorm,
    affinity,
    count: affinity.length,
  });
}
