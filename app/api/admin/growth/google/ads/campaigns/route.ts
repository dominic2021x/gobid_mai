import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { runGaql } from "@/lib/google/apis/googleAds";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CUSTOMER_KEY = "google_ads_customer_id";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return growthJsonError("google_ads_customer_id not set in growth_settings", "BAD_REQUEST", 400);
  }

  try {
    const { results } = await runGaql(customerId.trim(), "campaign_list");
    const rows = (results ?? []) as Array<Record<string, unknown>>;
    const campaigns = rows.map((row) => {
      const camp = (row.campaign ?? row.Campaign) as Record<string, unknown> | undefined;
      const budget = (row.campaign_budget ?? row.campaignBudget) as Record<string, unknown> | undefined;
      const targetCpa = (camp?.target_cpa ?? (camp as Record<string, unknown>)?.targetCpa) as Record<string, unknown> | undefined;
      const id = str(camp?.id ?? (camp as Record<string, unknown>)?.id);
      const name = str(camp?.name ?? (camp as Record<string, unknown>)?.name);
      const status = str(camp?.status ?? (camp as Record<string, unknown>)?.status);
      const amountMicros = num(budget?.amount_micros ?? budget?.amountMicros);
      const budgetResourceName = str(budget?.resource_name ?? budget?.resourceName);
      const biddingStrategyType = str(camp?.bidding_strategy_type ?? (camp as Record<string, unknown>)?.biddingStrategyType);
      const targetCpaMicros = num(targetCpa?.target_cpa_micros ?? targetCpa?.targetCpaMicros);
      return {
        id,
        name,
        status,
        amountMicros,
        budgetResourceName: budgetResourceName || undefined,
        biddingStrategyType: biddingStrategyType || undefined,
        targetCpaMicros: targetCpaMicros > 0 ? targetCpaMicros : undefined,
      };
    });
    return NextResponse.json({ campaigns });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
