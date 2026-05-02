import "server-only";
import { getGoogleAccessToken } from "@/lib/google/client";

const BASE = "https://googleads.googleapis.com/v20";
const FETCH_TIMEOUT_MS = 15000;

export interface GoogleAdsCustomer {
  customerId: string;
  resourceName: string;
}

/** Allowlisted GAQL query ids → query. No arbitrary GAQL. */
export const ALLOWLISTED_GAQL: Record<string, string> = {
  campaign_performance:
    "SELECT campaign.id, campaign.name, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.resource_name, campaign.bidding_strategy_type, campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  campaign_performance_14d:
    "SELECT campaign.id, campaign.name, segments.date, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.impressions FROM campaign WHERE segments.date DURING LAST_14_DAYS",
  campaign_performance_28d:
    "SELECT campaign.id, campaign.name, segments.date, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.impressions FROM campaign WHERE segments.date DURING LAST_28_DAYS",
  conversion_actions:
    "SELECT conversion_action.id, conversion_action.name, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'",
  search_terms:
    "SELECT search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS",
  keyword_waste:
    "SELECT ad_group_criterion.keyword.text, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
  keyword_quality:
    "SELECT ad_group_criterion.criterion_id, ad_group_criterion.resource_name, ad_group.id, ad_group.name, campaign.id, campaign.name, ad_group_criterion.keyword.text, metrics.historical_quality_score, metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
  hourly_performance:
    "SELECT campaign.id, campaign.name, segments.hour, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  device_performance:
    "SELECT campaign.id, campaign.name, segments.device, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  geo_performance:
    "SELECT campaign.id, campaign.name, segments.geo_target_region, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  campaign_criteria_ad_schedule:
    "SELECT campaign_criterion.resource_name, campaign.id, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type = 'AD_SCHEDULE'",
  campaign_criteria_device:
    "SELECT campaign_criterion.resource_name, campaign.id, campaign_criterion.device.type, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type = 'DEVICE'",
  campaign_criteria_location:
    "SELECT campaign_criterion.resource_name, campaign.id, campaign_criterion.location.geo_target_constant, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type = 'LOCATION'",
  network_performance:
    "SELECT campaign.id, campaign.name, segments.ad_network_type, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  matchtype_performance:
    "SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
  auction_pressure:
    "SELECT campaign.id, campaign.name, metrics.search_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share, metrics.average_cpc, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  auction_pressure_keyword:
    "SELECT ad_group_criterion.criterion_id, ad_group_criterion.resource_name, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.keyword.text, metrics.historical_quality_score, metrics.search_rank_lost_impression_share FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
  keyword_bids:
    "SELECT ad_group_criterion.criterion_id, ad_group_criterion.resource_name, ad_group_criterion.cpc_bid_micros, campaign.id, ad_group.id, ad_group_criterion.keyword.text FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED'",
  campaign_list:
    "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.resource_name, campaign.bidding_strategy_type, campaign.target_cpa.target_cpa_micros FROM campaign WHERE campaign.status != 'REMOVED'",
  ads_dashboard_7d:
    "SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.impressions, metrics.ctr, metrics.conversions_from_interactions_rate, metrics.average_cpc, metrics.search_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share FROM campaign WHERE segments.date DURING LAST_7_DAYS",
  ads_dashboard_30d:
    "SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.impressions, metrics.ctr, metrics.conversions_from_interactions_rate, metrics.average_cpc, metrics.search_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share FROM campaign WHERE segments.date DURING LAST_30_DAYS",
};

async function getAdsHeaders(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken("google_ads");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is required for Ads ops");
  headers["developer-token"] = devToken;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId && loginCustomerId.trim()) {
    headers["login-customer-id"] = loginCustomerId.trim();
  }
  return headers;
}

/**
 * List accessible customers (including MCC).
 */
export async function listGoogleAdsCustomers(): Promise<GoogleAdsCustomer[]> {
  const token = await getGoogleAccessToken("google_ads");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads API error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { resourceNames?: string[] };
    const names = data.resourceNames ?? [];
    return names.map((rn) => {
      const id = rn.replace(/^customers\//, "");
      return { customerId: id, resourceName: rn };
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run an allowlisted GAQL query. queryId must be in ALLOWLISTED_GAQL.
 */
export async function runGaql(
  customerId: string,
  queryId: string
): Promise<{ results: unknown[] }> {
  const query = ALLOWLISTED_GAQL[queryId];
  if (!query) throw new Error(`GAQL query not allowlisted: ${queryId}`);
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/customers/${customerId}/googleAds:searchStream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads searchStream error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      const results = (data as Array<{ results?: unknown[] }>).flatMap((b) => b.results ?? []);
      return { results };
    }
    const results = (data as { results?: unknown[] }).results ?? [];
    return { results };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * List conversion actions for customer (via allowlisted GAQL).
 */
export async function listConversionActions(customerId: string): Promise<unknown[]> {
  const { results } = await runGaql(customerId, "conversion_actions");
  return results;
}

/**
 * Create a conversion action. Writes to Ads API.
 */
export async function createConversionAction(
  customerId: string,
  name: string,
  type: "PAGE_LOAD" | "PURCHASE" | "LEAD" = "PAGE_LOAD"
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v20/customers/${customerId}/conversionActions:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              create: {
                name,
                type,
                status: "ENABLED",
              },
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads createConversionAction error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in createConversionAction response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ClickConversionRow {
  gclid: string;
  conversionAction: string;
  conversionDateTime: string;
  conversionValue?: number;
}

/**
 * Upload click conversions (batch). Writes to Ads API.
 */
export async function uploadClickConversions(
  customerId: string,
  conversions: ClickConversionRow[]
): Promise<{ partialFailureError?: string; results?: unknown[] }> {
  if (conversions.length === 0) return {};
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const body = {
      conversions: conversions.map((c) => ({
        gclid: c.gclid,
        conversionAction: c.conversionAction.startsWith("customers/") ? c.conversionAction : `customers/${customerId}/conversionActions/${c.conversionAction}`,
        conversionDateTime: c.conversionDateTime,
        conversionValue: c.conversionValue ?? 0,
      })),
      partialFailure: true,
    };
    const res = await fetch(
      `https://googleads.googleapis.com/v20/customers/${customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Google Ads uploadClickConversions error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = text ? (JSON.parse(text) as { partialFailureError?: { message?: string }; results?: unknown[] }) : {};
    return {
      partialFailureError: data.partialFailureError?.message,
      results: data.results,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Update campaign budget amount. Writes to Ads API.
 * budgetResourceName must be full resource name e.g. customers/123/campaignBudgets/456.
 */
export async function mutateCampaignBudget(
  customerId: string,
  budgetResourceName: string,
  amountMicros: number
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaignBudgets:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName: budgetResourceName.startsWith("customers/")
                  ? budgetResourceName
                  : `customers/${customerId}/campaignBudgets/${budgetResourceName}`,
                amountMicros: String(amountMicros),
              },
              updateMask: "amountMicros",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads mutateCampaignBudget error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in mutateCampaignBudget response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pause a campaign. Writes to Ads API.
 */
export async function pauseCampaign(
  customerId: string,
  campaignId: string
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = campaignId.startsWith("customers/")
    ? campaignId
    : `customers/${customerId}/campaigns/${campaignId}`;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                status: "PAUSED",
              },
              updateMask: "status",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads pauseCampaign error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in pauseCampaign response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Enable a campaign (set status to ENABLED). Writes to Ads API.
 */
export async function enableCampaign(
  customerId: string,
  campaignId: string
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = campaignId.startsWith("customers/")
    ? campaignId
    : `customers/${customerId}/campaigns/${campaignId}`;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                status: "ENABLED",
              },
              updateMask: "status",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads enableCampaign error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in enableCampaign response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Add negative keywords at campaign level. Writes to Ads API.
 * matchType: EXACT, PHRASE, BROAD.
 */
export async function addCampaignNegativeKeywords(
  customerId: string,
  campaignId: string,
  keywords: string[],
  matchType: "EXACT" | "PHRASE" | "BROAD" = "PHRASE"
): Promise<{ added: number }> {
  if (keywords.length === 0) return { added: 0 };
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const campaignResourceName = campaignId.startsWith("customers/")
    ? campaignId
    : `customers/${customerId}/campaigns/${campaignId}`;
  try {
    const operations = keywords.map((keyword) => ({
      create: {
        campaign: campaignResourceName,
        status: "ENABLED",
        keyword: {
          text: keyword,
          matchType,
        },
        negative: true,
      },
    }));
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaignCriteria:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ operations }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads addCampaignNegativeKeywords error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: unknown[] };
    return { added: data.results?.length ?? keywords.length };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Update campaign target CPA. Writes to Ads API. Only for TARGET_CPA campaigns.
 */
export async function mutateTargetCpa(
  customerId: string,
  campaignId: string,
  newTargetCpaMicros: number
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = campaignId.startsWith("customers/")
    ? campaignId
    : `customers/${customerId}/campaigns/${campaignId}`;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                targetCpa: {
                  targetCpaMicros: String(newTargetCpaMicros),
                },
              },
              updateMask: "targetCpa.targetCpaMicros",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads mutateTargetCpa error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in mutateTargetCpa response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Update campaign criterion bid modifier. Writes to Ads API.
 * resourceName: full resource name e.g. customers/123/campaignCriteria/456~789.
 * bidModifier: multiplier (e.g. 0.8 = -20%, 1.2 = +20%). Clamp to 0.01–10 in caller.
 */
export async function mutateCampaignCriterionBidModifier(
  customerId: string,
  criterionResourceName: string,
  bidModifier: number
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = criterionResourceName.startsWith("customers/")
    ? criterionResourceName
    : `customers/${customerId}/campaignCriteria/${criterionResourceName}`;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaignCriteria:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                bidModifier: String(bidModifier),
              },
              updateMask: "bidModifier",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads mutateCampaignCriterionBidModifier error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in mutateCampaignCriterionBidModifier response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pause (remove) an ad group criterion (keyword). Writes to Ads API.
 * resourceName: ad_group_criterion resource name.
 */
export async function pauseAdGroupCriterion(
  customerId: string,
  criterionResourceName: string
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = criterionResourceName.startsWith("customers/")
    ? criterionResourceName
    : criterionResourceName;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/adGroupCriteria:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [{ remove: resourceName }],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads pauseAdGroupCriterion error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    return { resourceName: first?.resourceName ?? resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Update keyword (ad group criterion) max CPC bid. Writes to Ads API.
 * cpcBidMicros: new max cpc in micros (e.g. 2000000 = 2.00).
 */
export async function updateAdGroupCriterionBid(
  customerId: string,
  criterionResourceName: string,
  cpcBidMicros: number
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = criterionResourceName.startsWith("customers/")
    ? criterionResourceName
    : criterionResourceName;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/adGroupCriteria:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                cpcBidMicros: String(Math.round(cpcBidMicros)),
              },
              updateMask: "cpcBidMicros",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads updateAdGroupCriterionBid error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    return { resourceName: first?.resourceName ?? resourceName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Disable search partners for a campaign. Writes to Ads API.
 * Sets network_settings.target_search_network = false (partners off; Google Search still on).
 */
export async function disableCampaignSearchPartners(
  customerId: string,
  campaignId: string
): Promise<{ resourceName: string }> {
  const headers = await getAdsHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const resourceName = campaignId.startsWith("customers/")
    ? campaignId
    : `customers/${customerId}/campaigns/${campaignId}`;
  try {
    const res = await fetch(
      `${BASE}/customers/${customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: {
                resourceName,
                networkSettings: {
                  targetSearchNetwork: false,
                },
              },
              updateMask: "networkSettings.targetSearchNetwork",
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads disableCampaignSearchPartners error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { results?: Array<{ resourceName: string }> };
    const first = data.results?.[0];
    if (!first?.resourceName) throw new Error("No resourceName in disableCampaignSearchPartners response");
    return { resourceName: first.resourceName };
  } finally {
    clearTimeout(timeout);
  }
}
