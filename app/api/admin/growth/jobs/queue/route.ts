import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();

  const [queuedRes, lockedRes, doneRes, failedRes] = await Promise.all([
    supabase.from("growth_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("growth_jobs").select("id", { count: "exact", head: true }).eq("status", "locked"),
    supabase.from("growth_jobs").select("id", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("growth_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const counts = {
    queued: queuedRes.count ?? 0,
    locked: lockedRes.count ?? 0,
    done: doneRes.count ?? 0,
    failed: failedRes.count ?? 0,
  };

  const [recentRes, quarantinedRes, healthRes] = await Promise.all([
    supabase
      .from("growth_jobs")
      .select("id, type, status, attempts, created_at, run_after, last_error")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("growth_jobs")
      .select("id, type, status, attempts, created_at, run_after, last_error")
      .eq("quarantined", true)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase.rpc("growth_jobs_health"),
  ]);

  if (recentRes.error) return growthJsonError(recentRes.error.message, "INTERNAL_ERROR", 500);

  const health = healthRes.data ?? {};
  return NextResponse.json({
    counts,
    jobs: recentRes.data ?? [],
    quarantined: quarantinedRes.data ?? [],
    health: {
      queuedByType: health.queuedByType ?? {},
      lockedByType: health.lockedByType ?? {},
      oldestQueuedAgeSecByType: health.oldestQueuedAgeSecByType ?? {},
      successRate24h: health.successRate24h ?? 0,
      p95RuntimeMsByType: health.p95RuntimeMsByType ?? {},
      quarantinedCount7d: health.quarantinedCount7d ?? 0,
    },
  });
}
