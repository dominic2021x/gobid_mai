import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
/** Admin-only: summary counts for personal search (no sensitive history). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  const [optInRes, profilesRes, lastRollupRes] = await Promise.all([
    supabase.from("search_personal_opt_in").select("user_id", { count: "exact", head: true }).eq("enabled", true),
    supabase.from("user_search_profiles").select("user_id", { count: "exact", head: true }),
    supabase.from("growth_events").select("created_at").eq("type", "search_personal_rollup_daily").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const optInCount = optInRes.count ?? 0;
  const profilesCount = profilesRes.count ?? 0;
  const lastRollupAt = (lastRollupRes.data as { created_at?: string } | null)?.created_at ?? null;
  return NextResponse.json({
    optInCount,
    profilesCount,
    lastRollupAt,
  });
}
