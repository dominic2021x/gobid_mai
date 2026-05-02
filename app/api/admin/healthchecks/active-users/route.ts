/**
 * GET /api/admin/healthchecks/active-users
 * Count distinct users with activity in last 5 and 15 minutes (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  try {
    const { data: last5, error: e5 } = await supabaseAdmin
      .from("user_activity_logs")
      .select("user_id")
      .gte("created_at", fiveMinAgo);

    const { data: last15, error: e15 } = await supabaseAdmin
      .from("user_activity_logs")
      .select("user_id")
      .gte("created_at", fifteenMinAgo);

    if (e5 || e15) {
      return NextResponse.json(
        { error: e5?.message || e15?.message || "Failed to fetch activity" },
        { status: 500 }
      );
    }

    const distinct5 = new Set((last5 ?? []).map((r: { user_id: string }) => r.user_id));
    const distinct15 = new Set((last15 ?? []).map((r: { user_id: string }) => r.user_id));

    return NextResponse.json({
      last5Min: distinct5.size,
      last15Min: distinct15.size,
      updatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[active-users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
