import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pauseCampaign, enableCampaign, mutateCampaignBudget, mutateTargetCpa } from "@/lib/google/apis/googleAds";

const PRODUCT = "google_ads";

async function logEvent(
  supabase: SupabaseClient,
  type: string,
  meta: Record<string, unknown>
): Promise<void> {
  await supabase.from("growth_events").insert({ type, meta });
}

export async function handleGoogleAdsCampaignPause(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = payload.customerId as string;
  const campaignId = payload.campaignId as string;
  if (!customerId || !campaignId) {
    return { ok: false, error: "Missing customerId or campaignId" };
  }
  try {
    await logEvent(supabase, "google_ads_control_campaign_pause_before", {
      customerId,
      campaignId,
      correlationId,
    });
    const result = await pauseCampaign(customerId, campaignId);
    await logEvent(supabase, "google_ads_control_campaign_pause_after", {
      customerId,
      campaignId,
      resourceName: result.resourceName,
      correlationId,
    });
    return { ok: true, meta: { resourceName: result.resourceName } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(supabase, "google_ads_control_campaign_pause_failed", {
      customerId,
      campaignId,
      error: msg,
      correlationId,
    });
    return { ok: false, error: msg };
  }
}

export async function handleGoogleAdsCampaignEnable(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = payload.customerId as string;
  const campaignId = payload.campaignId as string;
  if (!customerId || !campaignId) {
    return { ok: false, error: "Missing customerId or campaignId" };
  }
  try {
    await logEvent(supabase, "google_ads_control_campaign_enable_before", {
      customerId,
      campaignId,
      correlationId,
    });
    const result = await enableCampaign(customerId, campaignId);
    await logEvent(supabase, "google_ads_control_campaign_enable_after", {
      customerId,
      campaignId,
      resourceName: result.resourceName,
      correlationId,
    });
    return { ok: true, meta: { resourceName: result.resourceName } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(supabase, "google_ads_control_campaign_enable_failed", {
      customerId,
      campaignId,
      error: msg,
      correlationId,
    });
    return { ok: false, error: msg };
  }
}

export async function handleGoogleAdsCampaignBudget(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = payload.customerId as string;
  const budgetResourceName = payload.budgetResourceName as string;
  const amountMicros = Number(payload.amountMicros);
  if (!customerId || !budgetResourceName || !Number.isFinite(amountMicros) || amountMicros < 0) {
    return { ok: false, error: "Missing or invalid customerId, budgetResourceName, or amountMicros" };
  }
  try {
    await logEvent(supabase, "google_ads_control_campaign_budget_before", {
      customerId,
      budgetResourceName,
      amountMicros,
      correlationId,
    });
    const result = await mutateCampaignBudget(customerId, budgetResourceName, amountMicros);
    await logEvent(supabase, "google_ads_control_campaign_budget_after", {
      customerId,
      budgetResourceName,
      amountMicros,
      resourceName: result.resourceName,
      correlationId,
    });
    return { ok: true, meta: { resourceName: result.resourceName } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(supabase, "google_ads_control_campaign_budget_failed", {
      customerId,
      budgetResourceName,
      error: msg,
      correlationId,
    });
    return { ok: false, error: msg };
  }
}

export async function handleGoogleAdsCampaignBidding(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = payload.customerId as string;
  const campaignId = payload.campaignId as string;
  const targetCpaMicros = Number(payload.targetCpaMicros);
  if (!customerId || !campaignId || !Number.isFinite(targetCpaMicros) || targetCpaMicros < 0) {
    return { ok: false, error: "Missing or invalid customerId, campaignId, or targetCpaMicros" };
  }
  try {
    await logEvent(supabase, "google_ads_control_campaign_bidding_before", {
      customerId,
      campaignId,
      targetCpaMicros,
      correlationId,
    });
    const result = await mutateTargetCpa(customerId, campaignId, targetCpaMicros);
    await logEvent(supabase, "google_ads_control_campaign_bidding_after", {
      customerId,
      campaignId,
      targetCpaMicros,
      resourceName: result.resourceName,
      correlationId,
    });
    return { ok: true, meta: { resourceName: result.resourceName } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(supabase, "google_ads_control_campaign_bidding_failed", {
      customerId,
      campaignId,
      error: msg,
      correlationId,
    });
    return { ok: false, error: msg };
  }
}
