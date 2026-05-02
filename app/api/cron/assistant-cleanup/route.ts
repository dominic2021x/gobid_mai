/**
 * Șterge conversațiile asistentului mai vechi de 30 de zile.
 * GET /api/cron/assistant-cleanup
 * Schedule: zilnic (ex: 0 4 * * * – 04:00 UTC).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 * CASCADE șterge: assistant_messages, assistant_state, assistant_events.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV !== "development" && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "supabaseAdmin not configured" }, { status: 500 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffIso = cutoff.toISOString();

    const { data: toDelete, error: selectError } = await supabaseAdmin
      .from("assistant_conversations")
      .select("id")
      .lt("updated_at", cutoffIso);

    if (selectError) {
      console.error("[cron/assistant-cleanup] select error:", selectError);
      return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
    }

    const ids = (toDelete ?? []).map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        deleted: 0,
        cutoff: cutoffIso,
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("assistant_conversations")
      .delete()
      .in("id", ids);

    if (deleteError) {
      console.error("[cron/assistant-cleanup] delete error:", deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deleted: ids.length,
      cutoff: cutoffIso,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/assistant-cleanup]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
