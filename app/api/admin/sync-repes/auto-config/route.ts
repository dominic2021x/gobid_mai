/**
 * GET – citește configurarea import automat REPES.
 * POST – salvează configurarea (interval ore, import noi, verificare stare).
 * Stocare: integration_settings, key = repes_auto.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const KEY = "repes_auto";

export type RepesAutoConfig = {
  interval_hours: number;
  sync_new: boolean;
  verify_status: boolean;
  auto_publish: boolean;
  last_run_at: string | null;
  updated_at?: string;
};

const DEFAULT: RepesAutoConfig = {
  interval_hours: 6,
  sync_new: true,
  verify_status: true,
  auto_publish: false,
  last_run_at: null,
};

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const { data: row } = await supabaseAdmin
    .from("integration_settings")
    .select("settings, updated_at")
    .eq("key", KEY)
    .maybeSingle();

  const settings = (row?.settings as Partial<RepesAutoConfig>) ?? {};
  const config: RepesAutoConfig = {
    interval_hours: typeof settings.interval_hours === "number" ? settings.interval_hours : DEFAULT.interval_hours,
    sync_new: typeof settings.sync_new === "boolean" ? settings.sync_new : DEFAULT.sync_new,
    verify_status: typeof settings.verify_status === "boolean" ? settings.verify_status : DEFAULT.verify_status,
    auto_publish: typeof settings.auto_publish === "boolean" ? settings.auto_publish : DEFAULT.auto_publish,
    last_run_at: settings.last_run_at ?? DEFAULT.last_run_at,
    updated_at: (row as { updated_at?: string })?.updated_at,
  };

  return NextResponse.json({ success: true, config });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let body: { interval_hours?: number; sync_new?: boolean; verify_status?: boolean; auto_publish?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("integration_settings")
    .select("settings")
    .eq("key", KEY)
    .maybeSingle();

  const prev = (existing?.settings as Partial<RepesAutoConfig>) ?? {};
  const nextSettings = {
    ...prev,
    interval_hours: typeof body.interval_hours === "number" ? Math.max(1, Math.min(24, body.interval_hours)) : prev.interval_hours ?? DEFAULT.interval_hours,
    sync_new: typeof body.sync_new === "boolean" ? body.sync_new : prev.sync_new ?? DEFAULT.sync_new,
    verify_status: typeof body.verify_status === "boolean" ? body.verify_status : prev.verify_status ?? DEFAULT.verify_status,
    auto_publish: typeof body.auto_publish === "boolean" ? body.auto_publish : prev.auto_publish ?? DEFAULT.auto_publish,
    last_run_at: prev.last_run_at ?? null,
  };

  const { error } = await supabaseAdmin
    .from("integration_settings")
    .upsert({ key: KEY, settings: nextSettings }, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    config: {
      interval_hours: nextSettings.interval_hours,
      sync_new: nextSettings.sync_new,
      verify_status: nextSettings.verify_status,
      auto_publish: nextSettings.auto_publish,
      last_run_at: nextSettings.last_run_at,
    },
  });
}
