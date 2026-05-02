import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CACHE_HEADERS = { "Cache-Control": "private, max-age=30" };

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const days = Math.min(
    parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30,
    90
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  const [runsRes, queuedRes] = await Promise.all([
    supabase
      .from("growth_job_runs")
      .select("id, job_id, started_at, ok")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(2000),
    supabase
      .from("growth_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
  ]);

  if (runsRes.error) return growthJsonError(runsRes.error.message, "INTERNAL_ERROR", 500);
  const runs = runsRes.data ?? [];

  const runList = runs;
  const jobIds = [...new Set(runList.map((r) => r.job_id))];
  const jobTypeMap: Record<string, string> = {};

  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("growth_jobs")
      .select("id, type")
      .in("id", jobIds.slice(0, 500));
    for (const j of jobs ?? []) {
      jobTypeMap[(j as { id: string; type: string }).id] =
        (j as { id: string; type: string }).type ?? "unknown";
    }
  }

  const byDate: Record<
    string,
    { total: number; ok: number; failed: number; byType: Record<string, number> }
  > = {};
  let totalRuns = 0;
  let okRuns = 0;
  let failedRuns = 0;
  const byType: Record<string, { total: number; ok: number; failed: number }> =
    {};

  for (const r of runList) {
    const date = r.started_at.slice(0, 10);
    if (!byDate[date]) {
      byDate[date] = { total: 0, ok: 0, failed: 0, byType: {} };
    }
    byDate[date].total += 1;
    totalRuns += 1;

    const type = jobTypeMap[r.job_id] ?? "unknown";
    if (!byType[type]) byType[type] = { total: 0, ok: 0, failed: 0 };
    byType[type].total += 1;

    if (r.ok === true) {
      byDate[date].ok += 1;
      okRuns += 1;
      byType[type].ok += 1;
    } else if (r.ok === false) {
      byDate[date].failed += 1;
      failedRuns += 1;
      byType[type].failed += 1;
    }
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      runs: v.total,
      ok: v.ok,
      failed: v.failed,
      successRate: v.total > 0 ? Math.round((v.ok / v.total) * 100) : 0,
    }));

  const biggestChanges = Object.entries(byType)
    .map(([type, v]) => ({
      type,
      total: v.total,
      ok: v.ok,
      failed: v.failed,
      successRate: v.total > 0 ? Math.round((v.ok / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return NextResponse.json(
    {
      kpis: {
        totalRuns,
        okRuns,
        failedRuns,
        successRate:
          totalRuns > 0 ? Math.round((okRuns / totalRuns) * 100) : 0,
        queuedJobs: queuedRes.count ?? 0,
      },
      chartData,
      biggestChanges,
    },
    { headers: CACHE_HEADERS }
  );
}
