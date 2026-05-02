/**
 * GET /api/admin/search/autocorrect
 * Analytics for autocorrect: top corrections, acceptance/ignore rates, weak vs useful.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 20;

const DEFAULT_DAYS = 14;
const TOP_LIMIT = 50;
const WEAK_SHOWN_MIN = 5;
const WEAK_ACCEPTANCE_MAX = 0.2;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(30, Math.max(1, parseInt(daysParam ?? String(DEFAULT_DAYS), 10) || DEFAULT_DAYS));

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: dailyRows, error: dailyError } = await supabase
    .from("search_autocorrect_daily_stats")
    .select("day, original_query_norm, suggested_query_norm, page_context, shown_count, accepted_count, ignored_count, reformulated_count")
    .gte("day", sinceStr)
    .order("day", { ascending: false })
    .limit(2000);

  if (dailyError) {
    return NextResponse.json({ ok: false, error: dailyError.message }, { status: 500 });
  }

  const rows = (dailyRows ?? []) as Array<{
    day: string;
    original_query_norm: string;
    suggested_query_norm: string;
    page_context: string;
    shown_count: number;
    accepted_count: number;
    ignored_count: number;
    reformulated_count: number;
  }>;

  type AggKey = string;
  const agg = new Map<
    AggKey,
    { shown: number; accepted: number; ignored: number; reformulated: number }
  >();

  const SEP = "\u0001";
  for (const r of rows) {
    const key = `${r.original_query_norm}${SEP}${r.suggested_query_norm}${SEP}${r.page_context}`;
    const cur = agg.get(key) ?? { shown: 0, accepted: 0, ignored: 0, reformulated: 0 };
    cur.shown += Number(r.shown_count) ?? 0;
    cur.accepted += Number(r.accepted_count) ?? 0;
    cur.ignored += Number(r.ignored_count) ?? 0;
    cur.reformulated += Number(r.reformulated_count) ?? 0;
    agg.set(key, cur);
  }

  const list: Array<{
    original_query_norm: string;
    suggested_query_norm: string;
    page_context: string;
    shown_count: number;
    accepted_count: number;
    ignored_count: number;
    reformulated_count: number;
    acceptance_rate: number | null;
    ignore_rate: number | null;
    total_actions: number;
  }> = [];

  for (const [key, s] of agg) {
    const parts = key.split(SEP);
    const original_query_norm = parts[0] ?? "";
    const suggested_query_norm = parts[1] ?? "";
    const page_context = parts[2] ?? "";
    const totalActions = s.accepted + s.ignored + s.reformulated;
    const acceptance_rate =
      totalActions > 0 ? Math.round((s.accepted / totalActions) * 1000) / 1000 : null;
    const ignore_rate =
      totalActions > 0 ? Math.round((s.ignored / totalActions) * 1000) / 1000 : null;
    list.push({
      original_query_norm: original_query_norm ?? "",
      suggested_query_norm: suggested_query_norm ?? "",
      page_context: page_context ?? "",
      shown_count: s.shown,
      accepted_count: s.accepted,
      ignored_count: s.ignored,
      reformulated_count: s.reformulated,
      acceptance_rate,
      ignore_rate,
      total_actions: totalActions,
    });
  }

  const byShown = [...list].sort((a, b) => b.shown_count - a.shown_count).slice(0, TOP_LIMIT);
  const withAcceptance = list.filter((x) => x.acceptance_rate != null);
  const byAcceptance = [...withAcceptance].sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0)).slice(0, TOP_LIMIT);
  const weak = list.filter(
    (x) =>
      x.shown_count >= WEAK_SHOWN_MIN &&
      x.total_actions > 0 &&
      (x.acceptance_rate ?? 0) <= WEAK_ACCEPTANCE_MAX
  ).sort((a, b) => b.shown_count - a.shown_count).slice(0, TOP_LIMIT);

  const totals = list.reduce(
    (acc, x) => ({
      shown: acc.shown + x.shown_count,
      accepted: acc.accepted + x.accepted_count,
      ignored: acc.ignored + x.ignored_count,
      reformulated: acc.reformulated + x.reformulated_count,
    }),
    { shown: 0, accepted: 0, ignored: 0, reformulated: 0 }
  );
  const totalActions = totals.accepted + totals.ignored + totals.reformulated;
  const overall_acceptance_rate = totalActions > 0 ? totals.accepted / totalActions : null;
  const overall_ignore_rate = totalActions > 0 ? totals.ignored / totalActions : null;

  return NextResponse.json({
    ok: true,
    range_days: days,
    since: sinceStr,
    summary: {
      total_shown: totals.shown,
      total_accepted: totals.accepted,
      total_ignored: totals.ignored,
      total_reformulated: totals.reformulated,
      acceptance_rate: overall_acceptance_rate != null ? Math.round(overall_acceptance_rate * 1000) / 1000 : null,
      ignore_rate: overall_ignore_rate != null ? Math.round(overall_ignore_rate * 1000) / 1000 : null,
    },
    top_by_shown: byShown,
    top_by_acceptance_rate: byAcceptance,
    weak_corrections: weak,
    all_entries_count: list.length,
  });
}
