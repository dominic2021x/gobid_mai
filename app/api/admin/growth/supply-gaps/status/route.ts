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
    const { data: gaps, error } = await supabase
      .from("market_supply_gaps")
      .select("id, q_norm, category_slug, county_slug, search_demand, listing_supply, gap_score, quality_score, flags, action_state, status, created_at")
      .order("gap_score", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ gaps: gaps ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
