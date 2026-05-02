/**
 * Site Health Monitor – cron runner.
 * GET /api/cron/healthcheck?slot=00 | slot=01
 * Schedule: 5 0 * * * and 5 1 * * * (DST safe; only one will be 03:xx Europe/Bucharest).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runAllChecks } from "@/lib/healthcheck/runner";
import { checkLoad } from "@/lib/healthcheck/loadCheck";
import { nowBucharestISO } from "@/lib/healthcheck/utils";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

const TIMEZONE = "Europe/Bucharest";
const RUN_HOUR = 3;

function getNowInBucharest(): { date: Date; hour: number; dateString: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = parseInt(get("hour"), 10);
  const dateString = `${get("year")}-${get("month")}-${get("day")}`;
  const nowRo = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  return { date: nowRo, hour, dateString };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV !== "development" && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { hour, dateString } = getNowInBucharest();
    if (hour !== RUN_HOUR) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "not_03_xx_bucharest", hour, dateString },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });
    }

    const runDate = dateString;
    const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
    const version = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    const startedAt = new Date().toISOString();
    const nowRo = nowBucharestISO();

    const { data: existingRun, error: selectError } = await supabaseAdmin
      .from("healthcheck_runs")
      .select("id")
      .eq("run_date", runDate)
      .eq("source", "cron")
      .maybeSingle();

    if (selectError) {
      console.error("[healthcheck] select run error", selectError);
      return NextResponse.json({ error: "DB error checking run", detail: selectError.message }, { status: 500 });
    }

    if (existingRun) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "daily_lock", run_date: runDate },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: settingsRow } = await supabaseAdmin
      .from("healthcheck_settings")
      .select("auto_enabled, window_start_time, window_end_time, load_threshold_ms, schedule_days")
      .eq("id", 1)
      .maybeSingle();

    const scheduleDaysStr = (settingsRow?.schedule_days != null ? String(settingsRow.schedule_days) : "0,1,2,3,4,5,6").trim();
    const allowedDays = new Set(scheduleDaysStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6));
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const nowInRo = new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" });
    const todayRo = new Date(nowInRo);
    const dayOfWeek = todayRo.getDay();
    if (allowedDays.size === 0 || !allowedDays.has(dayOfWeek)) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "not_scheduled_day", dayOfWeek: dayNames[dayOfWeek], schedule_days: scheduleDaysStr },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const autoEnabled = !!settingsRow?.auto_enabled;
    const thresholdMs = Number(settingsRow?.load_threshold_ms) || 4000;
    const ACTIVITY_THRESHOLD_MIN = 10;

    if (autoEnabled) {
      let activeCount5 = 0;
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: activities } = await supabaseAdmin
          .from("user_activity_logs")
          .select("user_id")
          .gte("created_at", fiveMinAgo);
        activeCount5 = new Set((activities ?? []).map((r: { user_id: string }) => r.user_id)).size;
      } catch {
        // ignore
      }

      const load = await checkLoad(thresholdMs);
      const busyByTime = load.durationMs > thresholdMs;
      const busyByStatus = load.status !== null && (load.status < 200 || load.status >= 500);
      const tooManyUsers = activeCount5 > ACTIVITY_THRESHOLD_MIN;
      const busy = load.busy && (tooManyUsers || busyByStatus);

      if (busy) {
        return NextResponse.json(
          {
            ok: true,
            skipped: true,
            reason: "load_high",
            retryAfterMin: load.retryAfterMin,
            durationMs: load.durationMs,
            activeUsers5Min: activeCount5,
          },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

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
        source: "cron",
      })
      .select("id")
      .single();

    if (insertRunError) {
      if (insertRunError.code === "23505") {
        return NextResponse.json(
          { ok: true, skipped: true, reason: "daily_lock", run_date: runDate },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }
      console.error("[healthcheck] insert run error", insertRunError);
      return NextResponse.json({ error: "DB error inserting run", detail: insertRunError.message }, { status: 500 });
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

    const { error: insertChecksError } = await supabaseAdmin.from("healthcheck_checks").insert(rows);

    if (insertChecksError) {
      console.error("[healthcheck] insert checks error", insertChecksError);
    }

    const { error: updateRunError } = await supabaseAdmin
      .from("healthcheck_runs")
      .update({
        finished_at: finishedAt,
        ok: failed === 0,
        total,
        failed,
      })
      .eq("id", runId);

    if (updateRunError) {
      console.error("[healthcheck] update run error", updateRunError);
    }

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
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[healthcheck] error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Healthcheck failed" },
      { status: 500 }
    );
  }
}
