/**
 * GET /api/admin/healthchecks/runs
 * List healthcheck runs with pagination and filters. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get("perPage") ?? "20", 10)));
  const onlyFailed = searchParams.get("onlyFailed") === "true";
  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";

  let query = supabaseAdmin
    .from("healthcheck_runs")
    .select("id, run_date, started_at, finished_at, now_ro, ok, total, failed, env, version, source", { count: "exact" })
    .order("started_at", { ascending: false });

  if (onlyFailed) query = query.gt("failed", 0);
  if (fromDate) query = query.gte("run_date", fromDate);
  if (toDate) query = query.lte("run_date", toDate);

  const from = (page - 1) * perPage;
  const { data: runs, error, count } = await query.range(from, from + perPage - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    runs: runs ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
