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

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);
  const supabase = createAdminClient();

  const { data: runs, error } = await supabase
    .from("growth_job_runs")
    .select(
      "id, job_id, correlation_id, started_at, finished_at, ok, error, meta"
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  return NextResponse.json({ runs: runs ?? [] });
}
