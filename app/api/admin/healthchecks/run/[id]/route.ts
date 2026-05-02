/**
 * GET /api/admin/healthchecks/run/[id]
 * Get one healthcheck run with all its checks. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { id } = await params;
  const runId = parseInt(id, 10);
  if (Number.isNaN(runId) || runId < 1) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("healthcheck_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: checks, error: checksError } = await supabaseAdmin
    .from("healthcheck_checks")
    .select("*")
    .eq("run_id", runId)
    .order("ok", { ascending: true })
    .order("category")
    .order("name");

  if (checksError) {
    return NextResponse.json({ error: checksError.message }, { status: 500 });
  }

  const { buildActionItems } = await import("@/lib/healthcheck/actionItems");
  const actionItems = buildActionItems((checks ?? []) as import("@/lib/healthcheck/actionItems").HealthCheckRow[]);

  return NextResponse.json({
    run,
    checks: checks ?? [],
    actionItems,
  });
}
