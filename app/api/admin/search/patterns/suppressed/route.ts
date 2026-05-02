/**
 * GET /api/admin/search/patterns/suppressed – list auto-suppressed suggestions.
 * POST /api/admin/search/patterns/suppressed – run suppression job (call RPC).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const LIMIT = 200;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm, auto_suppressed_at, suppression_reason, is_active")
    .not("auto_suppressed_at", "is", null)
    .order("auto_suppressed_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    phrase: string;
    phrase_norm: string;
    auto_suppressed_at: string | null;
    suppression_reason: string | null;
    is_active: boolean;
  }>;

  return NextResponse.json({
    ok: true,
    suppressed: rows,
    count: rows.length,
  });
}

/** Run the auto-suppression RPC (mark weak suggestions is_active=false). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("search_suggestions_apply_auto_suppression", {
    p_min_impressions: 50,
    p_zero_click_suppress: true,
    p_low_ctr_threshold: 0.02,
    p_low_ctr_impressions_min: 30,
    p_max_to_update: 200,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const updated = (data ?? []) as Array<{ updated_id: string; phrase_norm: string; suppression_reason: string; had_impressions: number; had_clicks: number }>;
  return NextResponse.json({
    ok: true,
    updated: updated.length,
    details: updated,
  });
}
