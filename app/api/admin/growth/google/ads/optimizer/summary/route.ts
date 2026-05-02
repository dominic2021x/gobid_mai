import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting, getGrowthSettingStringArray } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const PRODUCT = "google_ads";
const CUSTOMER_KEY = "google_ads_customer_id";

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return growthJsonError("google_ads_customer_id not set", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const cid = customerId.trim();

  const [planRes, digestRes, killIds, pilotIds] = await Promise.all([
    supabase
      .from("growth_ai_plans")
      .select("id, plan, status, created_at")
      .eq("product", PRODUCT)
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("growth_google_snapshots")
      .select("result, created_at")
      .eq("product", PRODUCT)
      .eq("kind", "daily_digest")
      .eq("scope_ref", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getGrowthSettingStringArray("ads_optimizer_kill_campaign_ids", []),
    getGrowthSettingStringArray("ads_optimizer_pilot_campaign_ids", []),
  ]);

  const plan = planRes.data as { id?: string; plan?: Record<string, unknown>; status?: string; created_at?: string } | null;
  const digest = digestRes.data?.result as Record<string, unknown> | null;
  const planSummary = plan?.plan
    ? {
        planId: plan.id,
        planVersion: (plan.plan as Record<string, unknown>).planVersion,
        summary: (plan.plan as Record<string, unknown>).summary,
        status: plan.status,
        riskFlags: (plan.plan as Record<string, unknown>).riskFlags as string[] | undefined,
        stabilityMode: (plan.plan as Record<string, unknown>).stabilityMode,
        capitalProtectionActive: (plan.plan as Record<string, unknown>).capitalProtectionActive,
        coolingPeriodActive: (plan.plan as Record<string, unknown>).coolingPeriodActive,
        actionsCount: Array.isArray((plan.plan as Record<string, unknown>).actions)
          ? ((plan.plan as Record<string, unknown>).actions as unknown[]).length
          : 0,
        generatedAt: (plan.plan as Record<string, unknown>).generatedAt,
      }
    : null;

  const digestSummary = digest
    ? {
        date: digest.date,
        latestPlan: digest.latestPlan,
        recentJobRunsCount: digest.recentJobRunsCount,
        generatedAt: digest.generatedAt,
      }
    : null;

  return NextResponse.json({
    plan: planSummary,
    digest: digestSummary,
    killCampaignIdsCount: killIds.length,
    pilotCampaignIdsCount: pilotIds.length,
  });
}
