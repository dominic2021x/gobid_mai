/**
 * Delete cache_events older than 30 days.
 * GET /api/cron/cache-events-cleanup
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logCacheEvent } from "@/lib/admin/cacheEvents";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV !== "development" && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "supabaseAdmin not configured" }, { status: 500 });
    }

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("cache_events")
      .delete()
      .lt("created_at", cutoffIso)
      .select("id");

    if (deleteError) {
      await logCacheEvent({
        type: "cleanup",
        target: "cache_events",
        status: "error",
        meta: { deletedRows: 0, cutoff: cutoffIso },
      });
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    const deletedRows = deleted?.length ?? 0;
    await logCacheEvent({
      type: "cleanup",
      target: "cache_events",
      status: "ok",
      meta: { deletedRows, cutoff: cutoffIso },
    });
    return NextResponse.json({ ok: true, cutoff: cutoffIso, deletedRows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    await logCacheEvent({
      type: "cleanup",
      target: "cache_events",
      status: "error",
      meta: { deletedRows: 0, cutoff: cutoffIso },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
