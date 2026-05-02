/**
 * POST /api/admin/healthchecks/trigger
 * Run a manual healthcheck. Optionally skip load check (skipLoadCheck=true).
 * If load check runs and site is busy, returns 503 with retryAfter (20-40 min).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { runAllChecks } from "@/lib/healthcheck/runner";
import { checkLoad } from "@/lib/healthcheck/loadCheck";
import { nowBucharestISO, runDateBucharest } from "@/lib/healthcheck/utils";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const skipLoadCheck = body?.skipLoadCheck === true;

  if (!skipLoadCheck) {
    const ACTIVITY_THRESHOLD_MIN = 10; // sub acest număr de useri activi nu amânăm doar pentru timp de răspuns
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let activeCount5 = 0;
    try {
      const { data: activities } = await supabaseAdmin
        .from("user_activity_logs")
        .select("user_id")
        .gte("created_at", fiveMinAgo);
      activeCount5 = new Set((activities ?? []).map((r: { user_id: string }) => r.user_id)).size;
    } catch {
      // ignore, considerăm 0
    }

    let thresholdMs = 4000;
    try {
      const { data: settings } = await supabaseAdmin
        .from("healthcheck_settings")
        .select("load_threshold_ms")
        .eq("id", 1)
        .maybeSingle();
      if (settings?.load_threshold_ms) thresholdMs = settings.load_threshold_ms;
    } catch {
      // use default
    }

    const load = await checkLoad(thresholdMs);
    const busyByTime = load.durationMs > thresholdMs;
    const busyByStatus = load.status !== null && (load.status < 200 || load.status >= 500);
    const tooManyUsers = activeCount5 > ACTIVITY_THRESHOLD_MIN;
    const busy = load.busy && (tooManyUsers || busyByStatus);
    if (busy) {
      const reason = busyByStatus
        ? "Site-ul a răspuns cu eroare."
        : tooManyUsers
          ? `Trafic ridicat (${activeCount5} utilizatori activi în ultimele 5 min).`
          : "Trafic ridicat.";
      return NextResponse.json(
        {
          error: "Scanarea este amânată pentru a nu încărca site-ul.",
          busy: true,
          durationMs: load.durationMs,
          thresholdMs,
          activeUsers5Min: activeCount5,
          retryAfterMin: load.retryAfterMin,
          suggestion: `Încercați din nou în ${load.retryAfterMin} minute.`,
          detail: `${reason} Răspuns homepage: ${load.durationMs} ms (prag: ${thresholdMs} ms).`,
        },
        {
          status: 503,
          headers: {
            "Retry-After": String(load.retryAfterMin * 60),
            "Cache-Control": "no-store",
          },
        }
      );
    }
  }

  const runDate = runDateBucharest();
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const startedAt = new Date().toISOString();
  const nowRo = nowBucharestISO();

  const { data: insertedRun, error: insertRunError } = await supabaseAdmin
    .from("healthcheck_runs")
    .insert({
      run_date: runDate,
      started_at: startedAt,
      now_ro: nowRo,
      ok: false,
      total: 0,
      failed: 0,
      env,
      version,
      source: "manual",
    })
    .select("id")
    .single();

  if (insertRunError) {
    console.error("[healthcheck trigger] insert run error", insertRunError);
    return NextResponse.json({ error: insertRunError.message }, { status: 500 });
  }

  const runId = insertedRun.id;
  const results = await runAllChecks();
  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const finishedAt = new Date().toISOString();

  const rows = results.map((r) => ({
    run_id: runId,
    category: r.category,
    name: r.name,
    target_url: r.target_url,
    method: r.method,
    expected: r.expected,
    status: r.status,
    ok: r.ok,
    duration_ms: r.duration_ms,
    error_code: r.error_code,
    error_message: r.error_message,
    response_snippet: r.response_snippet,
    suggestion_key: r.suggestion_key,
    suggestion: r.suggestion,
  }));

  await supabaseAdmin.from("healthcheck_checks").insert(rows);

  await supabaseAdmin
    .from("healthcheck_runs")
    .update({
      finished_at: finishedAt,
      ok: failed === 0,
      total,
      failed,
    })
    .eq("id", runId);

  return NextResponse.json(
    {
      ok: failed === 0,
      run_id: runId,
      run_date: runDate,
      total,
      failed,
      started_at: startedAt,
      finished_at: finishedAt,
    },
    { status: 200 }
  );
}
