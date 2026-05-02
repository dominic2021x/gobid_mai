import "server-only";
import type { OptimizerAction } from "./planSchema";

const MAX_BID_MODIFIER = 10;
const MIN_BID_MODIFIER = 0.01;
const BID_MODIFIER_CHANGE_PCT = 20;

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).replace(/\D/g, "");
  return s ? Number(s) : 0;
}

function str(val: unknown): string {
  if (val == null) return "";
  return String(val);
}

/**
 * From keyword_quality snapshot results: detect QS <= 5.
 * Returns SUGGEST_AD_COPY_IMPROVEMENT for all low QS; optionally PAUSE_LOW_QS_KEYWORD when allowPause and QS <= 5.
 */
export function computeQualityScoreActions(
  keywordQualityResults: unknown[],
  options: { allowPauseLowQsKeyword: boolean; maxPauseQs?: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const maxPauseQs = options.maxPauseQs ?? 5;
  const rows = keywordQualityResults as Array<Record<string, unknown>>;
  for (const r of rows) {
    const qs = num(
      (r.metrics as Record<string, unknown>)?.historical_quality_score ??
        (r as Record<string, unknown>).historical_quality_score
    );
    if (qs > 5) continue;
    const adGroupCriterion = (r.ad_group_criterion ?? r.adGroupCriterion) as Record<string, unknown> | undefined;
    const criterionId = str(adGroupCriterion?.criterion_id ?? adGroupCriterion?.criterionId);
    const resourceName = str(adGroupCriterion?.resource_name ?? adGroupCriterion?.resourceName);
    const adGroup = (r.ad_group ?? r.adGroup) as Record<string, unknown> | undefined;
    const campaign = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const keyword = (adGroupCriterion?.keyword as Record<string, unknown>) ?? {};
    const keywordText = str(keyword.text);
    const campaignId = str(campaign?.id);
    const adGroupId = str(adGroup?.id);
    actions.push({
      type: "SUGGEST_AD_COPY_IMPROVEMENT",
      keywordId: criterionId || undefined,
      adGroupId: adGroupId || undefined,
      campaignId: campaignId || undefined,
      keywordText: keywordText || undefined,
      qualityScore: qs,
      reason: `Low Quality Score (${qs}); improve ad relevance and landing page.`,
      confidence: 0.9,
    });
    if (options.allowPauseLowQsKeyword && qs <= maxPauseQs && criterionId && resourceName) {
      actions.push({
        type: "PAUSE_LOW_QS_KEYWORD",
        criterionId,
        adGroupId,
        campaignId,
        resourceName: resourceName || undefined,
        qualityScore: qs,
        reason: `Pause keyword with QS ${qs} to reduce CPC waste.`,
        confidence: 0.85,
        autoApplyEligible: false,
      });
    }
  }
  return actions;
}

/**
 * From hourly_performance + campaign_criteria_ad_schedule: detect hours with cost > threshold and 0 conversions; reduce bid modifier.
 */
export function computeHourlyActions(
  hourlyResults: unknown[],
  criteriaResults: unknown[],
  options: { costThresholdMicros: number }
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const byCampaignHour = new Map<string, { costMicros: number; conversions: number }>();
  const rows = hourlyResults as Array<Record<string, unknown>>;
  for (const r of rows) {
    const campaign = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(campaign?.id);
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const hour = num(seg?.hour ?? seg?.Hour);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const key = `${campaignId}:${hour}`;
    const existing = byCampaignHour.get(key) ?? { costMicros: 0, conversions: 0 };
    byCampaignHour.set(key, {
      costMicros: existing.costMicros + costMicros,
      conversions: existing.conversions + conversions,
    });
  }
  const criteria = criteriaResults as Array<Record<string, unknown>>;
  const criteriaByCampaignHour = new Map<string, { resourceName: string; currentBidModifier: number }>();
  for (const c of criteria) {
    const camp = (c.campaign ?? c.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(camp?.id);
    const cc = (c.campaign_criterion ?? c.campaignCriterion) as Record<string, unknown> | undefined;
    const schedule = (cc?.ad_schedule ?? cc?.adSchedule) as Record<string, unknown> | undefined;
    const startHour = num(schedule?.start_hour ?? schedule?.startHour ?? 0);
    const endHour = num(schedule?.end_hour ?? schedule?.endHour ?? 24);
    const resourceName = str(cc?.resource_name ?? cc?.resourceName);
    const bidModifier = num(cc?.bid_modifier ?? cc?.bidModifier ?? 1);
    for (let h = startHour; h < endHour; h++) {
      criteriaByCampaignHour.set(`${campaignId}:${h}`, { resourceName, currentBidModifier: bidModifier });
    }
  }
  for (const [key, { costMicros, conversions }] of byCampaignHour) {
    if (conversions > 0 || costMicros < options.costThresholdMicros) continue;
    const crit = criteriaByCampaignHour.get(key);
    if (!crit || !crit.resourceName) continue;
    const [campaignId, hourStr] = key.split(":");
    const newModifier = Math.max(
      MIN_BID_MODIFIER,
      Math.min(MAX_BID_MODIFIER, crit.currentBidModifier * (1 - BID_MODIFIER_CHANGE_PCT / 100))
    );
    if (newModifier >= crit.currentBidModifier) continue;
    actions.push({
      type: "ADJUST_AD_SCHEDULE",
      campaignId,
      criterionResourceName: crit.resourceName,
      currentBidModifier: crit.currentBidModifier,
      newBidModifier: Math.round(newModifier * 100) / 100,
      endHour: parseInt(hourStr, 10),
      reason: `Hour ${hourStr}: cost ${costMicros} micros, 0 conversions; reduce bid.`,
      confidence: 0.85,
      autoApplyEligible: true,
    });
  }
  return actions;
}

/**
 * From device_performance + campaign_criteria_device: device CPA 30% worse than account avg -> reduce bid modifier.
 */
export function computeDeviceActions(
  deviceResults: unknown[],
  criteriaResults: unknown[],
  accountAvgCpa: number
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  if (accountAvgCpa <= 0) return actions;
  const byCampaignDevice = new Map<string, { costMicros: number; conversions: number; clicks: number }>();
  const rows = deviceResults as Array<Record<string, unknown>>;
  for (const r of rows) {
    const campaign = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(campaign?.id);
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const device = str(seg?.device ?? seg?.Device);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const clicks = num(m?.clicks);
    const key = `${campaignId}:${device}`;
    const existing = byCampaignDevice.get(key) ?? { costMicros: 0, conversions: 0, clicks: 0 };
    byCampaignDevice.set(key, {
      costMicros: existing.costMicros + costMicros,
      conversions: existing.conversions + conversions,
      clicks: existing.clicks + clicks,
    });
  }
  const criteria = criteriaResults as Array<Record<string, unknown>>;
  const criteriaByCampaignDevice = new Map<string, { resourceName: string; currentBidModifier: number }>();
  for (const c of criteria) {
    const camp = (c.campaign ?? c.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(camp?.id);
    const cc = (c.campaign_criterion ?? c.campaignCriterion) as Record<string, unknown> | undefined;
    const deviceInfo = (cc?.device ?? (cc as Record<string, unknown>)?.device) as Record<string, unknown> | undefined;
    const deviceType = str(deviceInfo?.type ?? deviceInfo?.Type);
    const resourceName = str(cc?.resource_name ?? cc?.resourceName);
    const bidModifier = num(cc?.bid_modifier ?? cc?.bidModifier ?? 1);
    criteriaByCampaignDevice.set(`${campaignId}:${deviceType}`, { resourceName, currentBidModifier: bidModifier });
  }
  for (const [key, { costMicros, conversions, clicks }] of byCampaignDevice) {
    const deviceCpa = conversions > 0 ? costMicros / conversions : costMicros > 0 ? Infinity : 0;
    if (deviceCpa <= accountAvgCpa * 1.3) continue;
    const crit = criteriaByCampaignDevice.get(key);
    if (!crit || !crit.resourceName) continue;
    const [campaignId, deviceType] = key.split(":");
    const newModifier = Math.max(
      MIN_BID_MODIFIER,
      Math.min(MAX_BID_MODIFIER, crit.currentBidModifier * (1 - BID_MODIFIER_CHANGE_PCT / 100))
    );
    if (newModifier >= crit.currentBidModifier) continue;
    actions.push({
      type: "SET_DEVICE_BID_MODIFIER",
      campaignId,
      criterionResourceName: crit.resourceName,
      deviceType: deviceType || undefined,
      currentBidModifier: crit.currentBidModifier,
      newBidModifier: Math.round(newModifier * 100) / 100,
      reason: `Device ${deviceType} CPA ${(deviceCpa / 1e6).toFixed(2)} > account avg * 1.3; reduce bid.`,
      confidence: 0.85,
      autoApplyEligible: true,
    });
  }
  return actions;
}

/**
 * From geo_performance + campaign_criteria_location: waste regions (high cost, 0 conversions) -> reduce bid modifier.
 */
export function computeGeoActions(
  geoResults: unknown[],
  criteriaResults: unknown[],
  accountAvgCpa: number
): OptimizerAction[] {
  const actions: OptimizerAction[] = [];
  const byCampaignGeo = new Map<string, { costMicros: number; conversions: number; clicks: number }>();
  const rows = geoResults as Array<Record<string, unknown>>;
  for (const r of rows) {
    const campaign = (r.campaign ?? r.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(campaign?.id);
    const seg = (r.segments ?? r.Segments) as Record<string, unknown> | undefined;
    const geo = str(seg?.geo_target_region ?? seg?.geoTargetRegion);
    const m = (r.metrics ?? r.Metrics) as Record<string, unknown> | undefined;
    const costMicros = num(m?.costMicros ?? m?.cost_micros);
    const conversions = num(m?.conversions);
    const clicks = num(m?.clicks);
    const key = `${campaignId}:${geo}`;
    const existing = byCampaignGeo.get(key) ?? { costMicros: 0, conversions: 0, clicks: 0 };
    byCampaignGeo.set(key, {
      costMicros: existing.costMicros + costMicros,
      conversions: existing.conversions + conversions,
      clicks: existing.clicks + clicks,
    });
  }
  const criteria = criteriaResults as Array<Record<string, unknown>>;
  const criteriaByCampaignGeo = new Map<string, { resourceName: string; currentBidModifier: number }>();
  for (const c of criteria) {
    const camp = (c.campaign ?? c.Campaign) as Record<string, unknown> | undefined;
    const campaignId = str(camp?.id);
    const cc = (c.campaign_criterion ?? c.campaignCriterion) as Record<string, unknown> | undefined;
    const location = (cc?.location ?? (cc as Record<string, unknown>)?.location) as Record<string, unknown> | undefined;
    const geoTargetConstant = str(location?.geo_target_constant ?? location?.geoTargetConstant);
    const resourceName = str(cc?.resource_name ?? cc?.resourceName);
    const bidModifier = num(cc?.bid_modifier ?? cc?.bidModifier ?? 1);
    criteriaByCampaignGeo.set(`${campaignId}:${geoTargetConstant}`, { resourceName, currentBidModifier: bidModifier });
  }
  for (const [key, { costMicros, conversions }] of byCampaignGeo) {
    const geoCpa = conversions > 0 ? costMicros / conversions : costMicros > 0 ? Infinity : 0;
    if (conversions > 0 && geoCpa <= accountAvgCpa * 1.3) continue;
    if (conversions === 0 && costMicros < 500000) continue;
    const crit = criteriaByCampaignGeo.get(key);
    if (!crit || !crit.resourceName) continue;
    const [campaignId, geoTargetConstant] = key.split(":");
    const newModifier = Math.max(
      MIN_BID_MODIFIER,
      Math.min(MAX_BID_MODIFIER, crit.currentBidModifier * (1 - BID_MODIFIER_CHANGE_PCT / 100))
    );
    if (newModifier >= crit.currentBidModifier) continue;
    actions.push({
      type: "SET_LOCATION_BID_MODIFIER",
      campaignId,
      criterionResourceName: crit.resourceName,
      geoTargetConstant: geoTargetConstant || undefined,
      currentBidModifier: crit.currentBidModifier,
      newBidModifier: Math.round(newModifier * 100) / 100,
      reason: `Region ${geoTargetConstant}: waste (cost ${costMicros}, conv ${conversions}); reduce bid.`,
      confidence: 0.85,
      autoApplyEligible: true,
    });
  }
  return actions;
}
