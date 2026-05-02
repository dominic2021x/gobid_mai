/**
 * GET /api/admin/healthchecks/settings – read automation settings
 * PATCH /api/admin/healthchecks/settings – update (auto_enabled, window, load_threshold, postpone)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

function timeToHHMM(t: string): string {
  if (!t || typeof t !== "string") return "03:00";
  const match = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}`;
  const d = new Date("1970-01-01T" + t + "Z");
  if (isNaN(d.getTime())) return "03:00";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let data: Record<string, unknown> | null = null;
  let err: { message: string } | null = null;
  try {
    const result = await supabaseAdmin
      .from("healthcheck_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    data = result.data as Record<string, unknown> | null;
    err = result.error;
  } catch (e) {
    err = e instanceof Error ? e : { message: String(e) };
  }

  if (err || !data) {
    return NextResponse.json({
      auto_enabled: false,
      window_start_time: "03:00",
      window_end_time: "05:00",
      postpone_minutes_min: 20,
      postpone_minutes_max: 40,
      load_threshold_ms: 4000,
      schedule_days: "1,3,5",
      updated_at: null,
    });
  }

  const row = data as Record<string, unknown>;
  const scheduleDays = row?.schedule_days != null ? String(row.schedule_days) : "1,3,5";
  return NextResponse.json({
    auto_enabled: !!row?.auto_enabled,
    window_start_time: timeToHHMM(String(row?.window_start_time ?? "03:00")),
    window_end_time: timeToHHMM(String(row?.window_end_time ?? "05:00")),
    postpone_minutes_min: Number(row?.postpone_minutes_min) || 20,
    postpone_minutes_max: Number(row?.postpone_minutes_max) || 40,
    load_threshold_ms: Number(row?.load_threshold_ms) || 4000,
    schedule_days: scheduleDays,
    updated_at: row?.updated_at ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.auto_enabled === "boolean") payload.auto_enabled = body.auto_enabled;
  if (typeof body.window_start_time === "string") payload.window_start_time = body.window_start_time;
  if (typeof body.window_end_time === "string") payload.window_end_time = body.window_end_time;
  if (typeof body.postpone_minutes_min === "number") payload.postpone_minutes_min = body.postpone_minutes_min;
  if (typeof body.postpone_minutes_max === "number") payload.postpone_minutes_max = body.postpone_minutes_max;
  if (typeof body.load_threshold_ms === "number") payload.load_threshold_ms = body.load_threshold_ms;
  if (typeof body.schedule_days === "string") payload.schedule_days = body.schedule_days;

  const { data, error } = await supabaseAdmin
    .from("healthcheck_settings")
    .update(payload)
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    auto_enabled: !!row?.auto_enabled,
    window_start_time: timeToHHMM(String(row?.window_start_time ?? "03:00")),
    window_end_time: timeToHHMM(String(row?.window_end_time ?? "05:00")),
    postpone_minutes_min: Number(row?.postpone_minutes_min) || 20,
    postpone_minutes_max: Number(row?.postpone_minutes_max) || 40,
    load_threshold_ms: Number(row?.load_threshold_ms) || 4000,
    schedule_days: row?.schedule_days != null ? String(row.schedule_days) : "1,3,5",
    updated_at: row?.updated_at ?? null,
  });
}
