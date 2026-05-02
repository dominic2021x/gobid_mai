import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("growth_jobs_health");

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  return NextResponse.json({
    queuedByType: data?.queuedByType ?? {},
    lockedByType: data?.lockedByType ?? {},
    oldestQueuedAgeSecByType: data?.oldestQueuedAgeSecByType ?? {},
    successRate24h: data?.successRate24h ?? 0,
    p95RuntimeMsByType: data?.p95RuntimeMsByType ?? {},
    quarantinedCount7d: data?.quarantinedCount7d ?? 0,
  });
}
