import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  try {
    const [snapRes, itemsRes] = await Promise.all([
      supabase.from("growth_trend_snapshots").select("result, created_at").eq("kind", "detected_7d").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("growth_trend_items").select("id, key, q_norm, intent, county_slug, category_slug, spike_score, source_mix, recommended_actions, status, target_slug, created_at").order("spike_score", { ascending: false }).limit(100),
    ]);
    const snapshot = snapRes.data?.result ?? null;
    const snapshotAt = (snapRes.data as { created_at?: string } | null)?.created_at ?? null;
    const items = itemsRes.data ?? [];
    return NextResponse.json({ snapshot, snapshotAt, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
