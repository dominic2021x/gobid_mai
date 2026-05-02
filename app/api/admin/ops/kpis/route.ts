import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=5",
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const customerId = await getGrowthSetting("google_ads_customer_id");
  const cid = customerId?.trim() ?? "";

  const [
    searchHealthRes,
    jobsCountsRes,
    lastRunRes,
    optimizerSummaryRes,
    osLatestRes,
  ] = await Promise.all([
    supabase
      .from("growth_google_snapshots")
      .select("result, created_at")
      .eq("product", "search")
      .eq("kind", "health")
      .eq("scope_ref", "default")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("growth_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase
      .from("growth_job_runs")
      .select("job_id, started_at, finished_at, ok, error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    cid
      ? fetch(
          new URL("/api/admin/growth/google/ads/optimizer/summary", req.url).toString(),
          {
            headers: new Headers({
              Authorization: req.headers.get("Authorization") ?? "",
            }),
          }
        ).then((r) => r.json().catch(() => null))
      : Promise.resolve(null),
    fetch(new URL("/api/admin/growth/os/latest", req.url).toString(), {
      headers: new Headers({
        Authorization: req.headers.get("Authorization") ?? "",
      }),
    }).then((r) => r.json().catch(() => null)),
  ]);

  const searchHealth = searchHealthRes.data?.result as Record<string, unknown> | null;
  const queuedJobs = jobsCountsRes.count ?? 0;
  const lastRun = lastRunRes.data as { started_at?: string; ok?: boolean } | null;
  const optimizerSummary = optimizerSummaryRes as {
    plan?: {
      stabilityMode?: boolean;
      capitalProtectionActive?: boolean;
      coolingPeriodActive?: boolean;
      generatedAt?: string;
    };
    digest?: { generatedAt?: string };
  } | null;
  const osLatest = osLatestRes as { dailyPackAt?: string } | null;

  const [latencyRes, cacheRes, flywheelRes] = await Promise.all([
    supabase
      .from("search_health_samples")
      .select("latency_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(168),
    supabase
      .from("search_health_samples")
      .select("cache_hit, created_at")
      .order("created_at", { ascending: false })
      .limit(168),
    supabase
      .from("growth_events")
      .select("created_at, meta")
      .in("type", ["demand_flywheel_refresh", "demand_flywheel_execute"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latencySamples = (latencyRes.data ?? []) as Array<{ latency_ms: number; created_at: string }>;
  const cacheSamples = (cacheRes.data ?? []) as Array<{ cache_hit: boolean; created_at: string }>;
  const flywheelEvent = flywheelRes.data as { created_at?: string } | null;

  const latency7d = latencySamples
    .reduce(
      (acc, sample, i) => {
        const date = new Date(sample.created_at).toISOString().slice(0, 10);
        if (!acc.find((d) => d.date === date)) {
          acc.push({
            date,
            value: sample.latency_ms,
          });
        } else {
          const existing = acc.find((d) => d.date === date)!;
          existing.value = Math.round((existing.value + sample.latency_ms) / 2);
        }
        return acc;
      },
      [] as Array<{ date: string; value: number }>
    )
    .slice(0, 7)
    .reverse();

  const cache7d = cacheSamples.reduce(
    (acc, sample) => {
      const date = new Date(sample.created_at).toISOString().slice(0, 10);
      if (!acc[date]) acc[date] = { hits: 0, total: 0 };
      acc[date].total++;
      if (sample.cache_hit) acc[date].hits++;
      return acc;
    },
    {} as Record<string, { hits: number; total: number }>
  );
  const cacheRatio7d = Object.entries(cache7d)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, v]) => ({
      date,
      value: v.total > 0 ? Math.round((v.hits / v.total) * 100) : 0,
    }));

  const jobsByHourRes = await supabase
    .from("growth_job_runs")
    .select("started_at")
    .gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const jobsByHour = (jobsByHourRes.data ?? []).reduce(
    (acc, row) => {
      const hour = (row as { started_at: string }).started_at.slice(0, 13);
      acc[hour] = (acc[hour] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const queueTrend = Object.entries(jobsByHour)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  return NextResponse.json(
    {
      searchHealth: searchHealth
        ? {
            latencyMs: searchHealth.latencyMs as number,
            cacheHitRatio: searchHealth.cacheHitRatio as number,
            candidateCount: searchHealth.candidateCount as number,
            updatedAt: searchHealth.updatedAt as string,
          }
        : null,
      worker: {
        queuedJobs: queuedJobs,
        lastRunAt: lastRun?.started_at ?? null,
        lastRunOk: lastRun?.ok ?? null,
      },
      growthOs: {
        lastDailyPackAt: osLatest?.dailyPackAt ?? null,
      },
      flywheel: {
        lastRunAt: flywheelEvent?.created_at ?? null,
      },
      adsOptimizer: optimizerSummary?.plan
        ? {
            stabilityModeActive: optimizerSummary.plan.stabilityMode ?? false,
            coolingPeriodActive: optimizerSummary.plan.coolingPeriodActive ?? false,
            capitalProtectionActive: optimizerSummary.plan.capitalProtectionActive ?? false,
            lastDigestAt: optimizerSummary.digest?.generatedAt ?? null,
            lastPlanAt: optimizerSummary.plan.generatedAt ?? null,
          }
        : null,
      charts: {
        latency7d: latency7d.length > 0 ? latency7d : null,
        cacheHitRatio7d: cacheRatio7d.length > 0 ? cacheRatio7d : null,
        jobsQueueTrend: queueTrend.length > 0 ? queueTrend : null,
      },
    },
    { headers: CACHE_HEADERS }
  );
}
