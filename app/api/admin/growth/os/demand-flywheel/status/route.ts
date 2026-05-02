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
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [actionsRes, lastRefreshRes, lastExecuteRes, actions24hRes, feedbackEvalRes] = await Promise.all([
    supabase.from("growth_demand_actions").select("id, type, status, q_norm, demand_score, supply_count, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("growth_events").select("created_at, meta").eq("type", "demand_flywheel_refresh").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("growth_events").select("created_at, meta").eq("type", "demand_flywheel_execute").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("growth_demand_actions").select("type, status").gte("created_at", twentyFourHoursAgo),
    supabase.from("growth_demand_feedback").select("ctr_before, ctr_after, evaluated_at").not("evaluated_at", "is", null),
  ]);
  const actions = (actionsRes.data ?? []) as Array<{ id: string; type: string; status: string; q_norm: string | null; demand_score: number | null; supply_count: number | null; created_at: string }>;
  const pendingCount = actions.filter((a) => a.status === "pending").length;
  const lastRefresh = (lastRefreshRes.data as { created_at?: string; meta?: Record<string, unknown> } | null) ?? null;
  const lastExecute = (lastExecuteRes.data as { created_at?: string; meta?: Record<string, unknown> } | null) ?? null;

  const actions24h = (actions24hRes.data ?? []) as Array<{ type: string; status: string }>;
  const actionsLast24h = actions24h.length;
  const actionsByType: Record<string, { pending: number; executed: number; skipped: number }> = {};
  for (const a of actions24h) {
    if (!actionsByType[a.type]) actionsByType[a.type] = { pending: 0, executed: 0, skipped: 0 };
    const key = a.status as "pending" | "executed" | "skipped";
    if (key in actionsByType[a.type]) actionsByType[a.type][key]++;
  }

  const feedbackEval = (feedbackEvalRes.data ?? []) as Array<{ ctr_before: number | null; ctr_after: number | null }>;
  const withEval = feedbackEval.filter((f) => f.ctr_before != null && f.ctr_after != null);
  const successCount = withEval.filter((f) => (f.ctr_after ?? 0) > (f.ctr_before ?? 0)).length;
  const successRate = withEval.length > 0 ? successCount / withEval.length : null;

  return NextResponse.json({
    actions,
    pendingCount,
    lastRefreshAt: lastRefresh?.created_at ?? null,
    lastRefreshMeta: lastRefresh?.meta ?? null,
    lastExecuteAt: lastExecute?.created_at ?? null,
    lastExecuteMeta: lastExecute?.meta ?? null,
    actionsLast24h,
    actionsByType,
    successRate,
  });
}
