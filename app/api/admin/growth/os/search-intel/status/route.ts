import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  const [weightsRes, boostsRes, armsRes, lastRollupRes] = await Promise.all([
    supabase.from("search_intel_bucket_weights").select("bucket, w_lex, w_sem, w_graph, w_fresh, updated_at").order("bucket"),
    supabase.from("search_intel_query_boosts").select("q_norm, boost, updated_at").order("updated_at", { ascending: false }).limit(50),
    supabase.from("search_intel_arms").select("arm, bucket, impressions, clicks, long_clicks, updated_at").order("impressions", { ascending: false }),
    supabase.from("growth_events").select("created_at").eq("type", "search_intel_rollup_hourly").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const weights = (weightsRes.data ?? []) as Array<{ bucket: string; w_lex: number; w_sem: number; w_graph: number; w_fresh: number; updated_at: string }>;
  const boosts = (boostsRes.data ?? []) as Array<{ q_norm: string; boost: unknown; updated_at: string }>;
  const arms = (armsRes.data ?? []) as Array<{ arm: string; bucket: string; impressions: number; clicks: number; long_clicks: number; updated_at: string }>;
  const lastRollup = (lastRollupRes.data as { created_at?: string } | null)?.created_at ?? null;
  return NextResponse.json({
    bucketWeights: weights,
    topBoostedQueries: boosts,
    armPerformance: arms,
    lastRollupAt: lastRollup,
  });
}
