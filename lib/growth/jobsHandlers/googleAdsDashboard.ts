import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";
import { runGaql } from "@/lib/google/apis/googleAds";

const CUSTOMER_KEY = "google_ads_customer_id";
const PRODUCT = "google_ads";
const KIND = "ads_dashboard_pack";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

interface AggCampaign {
  id: string;
  name: string;
  status: string;
  biddingStrategyType: string;
  clicks: number;
  costMicros: number;
  conversions: number;
  impressions: number;
  searchImpressionShare: number;
  searchRankLostImpressionShare: number;
  searchBudgetLostImpressionShare: number;
}

function aggregateRows(rows: Array<Record<string, unknown>>): { campaigns: AggCampaign[]; totalClicks: number; totalCostMicros: number; totalConversions: number; totalImpressions: number } {
  const byId = new Map<string, { name: string; status: string; biddingStrategyType: string; clicks: number; costMicros: number; conversions: number; impressions: number; isSum: number; rankLostSum: number; budgetLostSum: number }>();
  for (const row of rows) {
    const camp = (row.campaign ?? row.Campaign) as Record<string, unknown> | undefined;
    const m = (row.metrics ?? row.Metrics) as Record<string, unknown> | undefined;
    const id = str(camp?.id ?? (camp as Record<string, unknown>)?.id);
    if (!id) continue;
    const clicks = num(m?.clicks ?? m?.Clicks);
    const costMicros = num(m?.cost_micros ?? m?.costMicros);
    const conversions = num(m?.conversions ?? m?.Conversions);
    const impressions = num(m?.impressions ?? m?.Impressions);
    const isShare = num(m?.search_impression_share ?? m?.searchImpressionShare);
    const rankLost = num(m?.search_rank_lost_impression_share ?? m?.searchRankLostImpressionShare);
    const budgetLost = num(m?.search_budget_lost_impression_share ?? m?.searchBudgetLostImpressionShare);
    const existing = byId.get(id);
    if (existing) {
      existing.clicks += clicks;
      existing.costMicros += costMicros;
      existing.conversions += conversions;
      existing.impressions += impressions;
      existing.isSum += isShare * impressions;
      existing.rankLostSum += rankLost * impressions;
      existing.budgetLostSum += budgetLost * impressions;
    } else {
      byId.set(id, {
        name: str(camp?.name ?? (camp as Record<string, unknown>)?.name),
        status: str(camp?.status ?? (camp as Record<string, unknown>)?.status),
        biddingStrategyType: str(camp?.bidding_strategy_type ?? (camp as Record<string, unknown>)?.biddingStrategyType),
        clicks,
        costMicros,
        conversions,
        impressions,
        isSum: isShare * impressions,
        rankLostSum: rankLost * impressions,
        budgetLostSum: budgetLost * impressions,
      });
    }
  }
  let totalClicks = 0;
  let totalCostMicros = 0;
  let totalConversions = 0;
  let totalImpressions = 0;
  const campaigns: AggCampaign[] = [];
  for (const [id, v] of byId) {
    totalClicks += v.clicks;
    totalCostMicros += v.costMicros;
    totalConversions += v.conversions;
    totalImpressions += v.impressions;
    campaigns.push({
      id,
      name: v.name,
      status: v.status,
      biddingStrategyType: v.biddingStrategyType,
      clicks: v.clicks,
      costMicros: v.costMicros,
      conversions: v.conversions,
      impressions: v.impressions,
      searchImpressionShare: v.impressions > 0 ? v.isSum / v.impressions : 0,
      searchRankLostImpressionShare: v.impressions > 0 ? v.rankLostSum / v.impressions : 0,
      searchBudgetLostImpressionShare: v.impressions > 0 ? v.budgetLostSum / v.impressions : 0,
    });
  }
  return { campaigns, totalClicks, totalCostMicros, totalConversions, totalImpressions };
}

function computeKpis(totalClicks: number, totalCostMicros: number, totalConversions: number, totalImpressions: number) {
  const cpcMicros = totalClicks > 0 ? totalCostMicros / totalClicks : 0;
  const cpaMicros = totalConversions > 0 ? totalCostMicros / totalConversions : 0;
  const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const convRate = totalClicks > 0 ? totalConversions / totalClicks : 0;
  const spend = totalCostMicros / 1_000_000;
  return { cpcMicros, cpaMicros, ctr, convRate, spend, conversions: totalConversions };
}

export async function handleGoogleAdsDashboardRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return { ok: false, error: "google_ads_customer_id not set in growth_settings" };
  }
  const cid = customerId.trim();

  try {
    const [res7, res30] = await Promise.all([
      runGaql(cid, "ads_dashboard_7d"),
      runGaql(cid, "ads_dashboard_30d"),
    ]);
    const rows7 = (res7.results ?? []) as Array<Record<string, unknown>>;
    const rows30 = (res30.results ?? []) as Array<Record<string, unknown>>;

    const agg7 = aggregateRows(rows7);
    const agg30 = aggregateRows(rows30);

    const kpis7d = computeKpis(agg7.totalClicks, agg7.totalCostMicros, agg7.totalConversions, agg7.totalImpressions);
    const kpis30d = computeKpis(agg30.totalClicks, agg30.totalCostMicros, agg30.totalConversions, agg30.totalImpressions);

    const campaigns7d = agg7.campaigns
      .sort((a, b) => b.costMicros - a.costMicros)
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        biddingStrategyType: c.biddingStrategyType,
        cpc: c.clicks > 0 ? c.costMicros / c.clicks : 0,
        cpa: c.conversions > 0 ? c.costMicros / c.conversions : 0,
        conversions: c.conversions,
        searchRankLostImpressionShare: c.searchRankLostImpressionShare,
        searchBudgetLostImpressionShare: c.searchBudgetLostImpressionShare,
      }));
    const campaigns30d = agg30.campaigns
      .sort((a, b) => b.costMicros - a.costMicros)
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        biddingStrategyType: c.biddingStrategyType,
        cpc: c.clicks > 0 ? c.costMicros / c.clicks : 0,
        cpa: c.conversions > 0 ? c.costMicros / c.conversions : 0,
        conversions: c.conversions,
        searchRankLostImpressionShare: c.searchRankLostImpressionShare,
        searchBudgetLostImpressionShare: c.searchBudgetLostImpressionShare,
      }));

    const generatedAt = new Date().toISOString();
    const result = {
      kpis7d: kpis7d,
      kpis30d: kpis30d,
      campaigns7d,
      campaigns30d,
      generatedAt,
    };

    await supabase.from("growth_google_snapshots").insert({
      product: PRODUCT,
      kind: KIND,
      scope_ref: cid,
      result: result as unknown as Record<string, unknown>,
    });

    await supabase.from("growth_events").insert({
      type: "google_ads_dashboard_refresh",
      meta: { customerId: cid, correlationId, generatedAt },
    });

    return { ok: true, meta: { generatedAt, campaignsCount: campaigns30d.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "google_ads_dashboard_refresh_failed",
      meta: { customerId: cid, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
