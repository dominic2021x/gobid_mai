import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthSetting } from "@/lib/growth/settings";
import {
  runGaql,
  createConversionAction,
  uploadClickConversions,
  ALLOWLISTED_GAQL,
  type ClickConversionRow,
} from "@/lib/google/apis/googleAds";

const CUSTOMER_KEY = "google_ads_customer_id";

async function getCustomerId(): Promise<string> {
  const id = await getGrowthSetting(CUSTOMER_KEY);
  if (!id || !id.trim()) throw new Error("google_ads_customer_id not set in growth_settings");
  return id.trim();
}

export async function handleGoogleAdsReport(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const queryId = (payload.queryId as string) || "campaign_performance";
  if (!ALLOWLISTED_GAQL[queryId]) {
    return { ok: false, error: `Query not allowlisted: ${queryId}` };
  }
  const { results } = await runGaql(customerId, queryId);
  const scopeRef = customerId;
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind: "report",
    scope_ref: scopeRef,
    result: { queryId, results, at: new Date().toISOString() },
  });
  return { ok: true, meta: { queryId, rowCount: (results as unknown[]).length } };
}

export async function handleGoogleAdsConversionActionsRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const { results } = await runGaql(customerId, "conversion_actions");
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind: "conversion_actions",
    scope_ref: customerId,
    result: { actions: results, at: new Date().toISOString() },
  });
  return { ok: true, meta: { rowCount: (results as unknown[]).length } };
}

export async function handleGoogleAdsSearchTermsRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  let results: unknown[];
  let queryId = "search_terms";
  try {
    const out = await runGaql(customerId, "search_terms");
    results = out.results;
    if (!results.length) {
      const fallback = await runGaql(customerId, "keyword_waste");
      results = fallback.results;
      queryId = "keyword_waste";
    }
  } catch (e) {
    try {
      const fallback = await runGaql(customerId, "keyword_waste");
      results = fallback.results;
      queryId = "keyword_waste";
    } catch {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind: "search_terms",
    scope_ref: customerId,
    result: { queryId, results, at: new Date().toISOString() },
  });
  return { ok: true, meta: { queryId, rowCount: results.length } };
}

export async function handleGoogleAdsConversionActionCreate(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const name = (payload.name as string)?.trim();
  if (!name) return { ok: false, error: "Missing name" };
  const type = ((payload.type as string) || "PAGE_LOAD") as "PAGE_LOAD" | "PURCHASE" | "LEAD";
  const { resourceName } = await createConversionAction(customerId, name, type);
  await supabase.from("growth_events").insert({
    type: "google_ads_conversion_action_create",
    meta: { customerId, name, resourceName, correlationId },
  });
  const actions = await runGaql(customerId, "conversion_actions");
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind: "conversion_actions",
    scope_ref: customerId,
    result: { actions, at: new Date().toISOString() },
  });
  return { ok: true, meta: { resourceName } };
}

export async function handleGoogleAdsConversionsUpload(
  payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  const conversions = payload.conversions as unknown;
  if (!Array.isArray(conversions) || conversions.length === 0) {
    return { ok: false, error: "Missing or empty conversions array" };
  }
  const rows: ClickConversionRow[] = conversions.map((c: unknown) => {
    const o = c as Record<string, unknown>;
    const gclid = String(o.gclid ?? "");
    const conversionAction = String(o.conversionAction ?? "");
    const conversionDateTime = String(o.conversionDateTime ?? "");
    const conversionValue = typeof o.conversionValue === "number" ? o.conversionValue : undefined;
    if (!gclid || !conversionAction || !conversionDateTime) {
      throw new Error("Each conversion must have gclid, conversionAction, conversionDateTime");
    }
    return { gclid, conversionAction, conversionDateTime, conversionValue };
  });
  const out = await uploadClickConversions(customerId, rows);
  await supabase.from("growth_events").insert({
    type: "google_ads_conversions_upload",
    meta: { customerId, count: rows.length, correlationId, partialFailure: !!out.partialFailureError },
  });
  return {
    ok: true,
    meta: { uploaded: rows.length, partialFailureError: out.partialFailureError, results: out.results },
  };
}

async function runAllowlistedAndSnapshot(
  customerId: string,
  queryId: keyof typeof ALLOWLISTED_GAQL,
  kind: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  if (!ALLOWLISTED_GAQL[queryId]) {
    return { ok: false, error: `Query not allowlisted: ${queryId}` };
  }
  const { results } = await runGaql(customerId, queryId);
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind,
    scope_ref: customerId,
    result: { queryId, results, at: new Date().toISOString() },
  });
  return { ok: true, meta: { queryId, kind, rowCount: (results as unknown[]).length } };
}

export async function handleGoogleAdsKeywordQualityRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "keyword_quality", "keyword_quality", supabase);
}

export async function handleGoogleAdsHourlyPerformanceRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "hourly_performance", "hourly_performance", supabase);
}

export async function handleGoogleAdsDevicePerformanceRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "device_performance", "device_performance", supabase);
}

export async function handleGoogleAdsGeoPerformanceRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "geo_performance", "geo_performance", supabase);
}

export async function handleGoogleAdsNetworkPerformanceRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "network_performance", "network_performance", supabase);
}

export async function handleGoogleAdsMatchtypePerformanceRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "matchtype_performance", "matchtype_performance", supabase);
}

export async function handleGoogleAdsSearchTermsStructureRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  return runAllowlistedAndSnapshot(customerId, "search_terms", "search_terms_structure", supabase);
}

export async function handleGoogleAdsAuctionPressureRefresh(
  payload: Record<string, unknown>,
  _correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const customerId = await getCustomerId();
  if (!ALLOWLISTED_GAQL["auction_pressure"] || !ALLOWLISTED_GAQL["auction_pressure_keyword"]) {
    return { ok: false, error: "auction_pressure queries not allowlisted" };
  }
  const [{ results: campaigns }, { results: keywords }] = await Promise.all([
    runGaql(customerId, "auction_pressure"),
    runGaql(customerId, "auction_pressure_keyword"),
  ]);
  await supabase.from("growth_google_snapshots").insert({
    product: "google_ads",
    kind: "auction_pressure",
    scope_ref: customerId,
    result: { campaigns, keywords, at: new Date().toISOString() },
  });
  return { ok: true, meta: { campaignRows: (campaigns as unknown[]).length, keywordRows: (keywords as unknown[]).length } };
}
