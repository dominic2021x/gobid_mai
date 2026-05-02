/**
 * POST /api/admin/sync-repes/run-auto
 * Rulează automat „Import anunțuri noi” și/sau „Verificare stare” dacă a trecut intervalul configurat.
 * Auth: Bearer (admin) sau x-sync-secret (pentru cron).
 * Dacă last_run + interval nu a trecut, răspunde cu skipped: true.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const KEY = "repes_auto";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export const maxDuration = 800; // Vercel Pro max

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  const envSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get("authorization");
  let allowed = false;
  if (envSecret && secret === envSecret) {
    allowed = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
      if (await isAdminUser(user)) allowed = true;
    } catch {
      // ignore
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const { data: row } = await supabaseAdmin
    .from("integration_settings")
    .select("settings")
    .eq("key", KEY)
    .maybeSingle();

  const settings = (row?.settings as { interval_hours?: number; sync_new?: boolean; verify_status?: boolean; auto_publish?: boolean; last_run_at?: string | null }) ?? {};
  const intervalHours = typeof settings.interval_hours === "number" ? Math.max(1, settings.interval_hours) : 6;
  const syncNew = settings.sync_new !== false;
  const verifyStatus = settings.verify_status !== false;
  const autoPublish = settings.auto_publish === true;
  const lastRunAt = settings.last_run_at ? new Date(settings.last_run_at) : null;
  const forceRun = request.headers.get("x-force-run") === "1" || new URL(request.url).searchParams.get("force") === "1";
  const onlyPublish = request.headers.get("x-only-publish") === "1" || new URL(request.url).searchParams.get("only") === "publish";

  const now = new Date();
  const nextRunAt = lastRunAt ? new Date(lastRunAt.getTime() + intervalHours * 60 * 60 * 1000) : now;
  if (!forceRun && !onlyPublish && lastRunAt && now.getTime() < nextRunAt.getTime()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "interval_not_elapsed",
      nextRunAt: nextRunAt.toISOString(),
      lastRunAt: lastRunAt.toISOString(),
    });
  }

  const origin = request.headers.get("x-forwarded-host")
    ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
    : new URL(request.url).origin;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (envSecret) headers["x-sync-secret"] = envSecret;
  if (authHeader) headers["Authorization"] = authHeader;

  const results: { step: string; success: boolean; error?: string; published?: number; failed?: number; total?: number }[] = [];

  if (syncNew && !onlyPublish) {
    try {
      const res = await fetch(`${origin}/api/admin/sync-repes/sync-new-only`, {
        method: "POST",
        headers,
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      results.push({ step: "sync_new", success: res.ok && !data.error, error: data.error });
    } catch (e) {
      results.push({ step: "sync_new", success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (verifyStatus && !onlyPublish) {
    try {
      const res = await fetch(`${origin}/api/admin/sync-repes/verify-status`, {
        method: "POST",
        headers,
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      results.push({ step: "verify_status", success: res.ok && !data.error, error: data.error });
    } catch (e) {
      results.push({ step: "verify_status", success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (autoPublish || onlyPublish) {
    const AUTO_PUBLISH_LIMIT = 30;
    const DELAY_MS = 5000;
    const { data: listings } = await supabaseAdmin
      .from("repes_listings")
      .select("id")
      .is("product_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(AUTO_PUBLISH_LIMIT);
    const ids = (listings ?? []).map((r) => r.id);
    let published = 0;
    let failed = 0;
    let firstPublishError: string | undefined;
    for (const listingId of ids) {
      try {
        const res = await fetch(`${origin}/api/admin/executari-publice/publish`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const data = await res.json().catch(() => ({}));
        const ok = res.ok && data.results?.[0]?.success;
        if (ok) published++;
        else {
          failed++;
          if (!firstPublishError && (data.error || data.results?.[0]?.error)) {
            firstPublishError = data.error ?? data.results[0].error;
          }
        }
      } catch (e) {
        failed++;
        if (!firstPublishError) firstPublishError = e instanceof Error ? e.message : String(e);
      }
      if (ids.indexOf(listingId) < ids.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
    results.push({
      step: "auto_publish",
      success: true,
      published,
      failed,
      total: ids.length,
      error: failed > 0 ? `Publicate: ${published}, eșec: ${failed}${firstPublishError ? ` (ex: ${firstPublishError})` : ""}` : undefined,
    });
  }

  if (!onlyPublish) {
    const nextSettings = {
      ...settings,
      last_run_at: now.toISOString(),
    };
    await supabaseAdmin
      .from("integration_settings")
      .upsert({ key: KEY, settings: nextSettings }, { onConflict: "key" });
  }

  return NextResponse.json({
    success: true,
    skipped: false,
    lastRunAt: now.toISOString(),
    nextRunAt: onlyPublish ? undefined : new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString(),
    results,
  });
}
