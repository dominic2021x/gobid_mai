import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { getGrowthSetting, getGrowthSettingBoolean } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CUSTOMER_KEY = "google_ads_customer_id";
const LAST_DAILY_KEY = "ads_optimizer_last_daily_key";
const DIGEST_DELAY_MINUTES = 60;

export async function GET(req: NextRequest) {
  try {
    await requireCronSecret(req);
  } catch {
    return growthJsonError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return runDaily(req, { force: false });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: { force?: boolean } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }
  return runDaily(req, { force: body.force === true });
}

async function runDaily(
  _req: NextRequest,
  options: { force: boolean }
): Promise<NextResponse> {
  const supabase = createAdminClient();

  const enabled = await getGrowthSettingBoolean("ads_optimizer_enabled", true);
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ads_optimizer_enabled is false",
    });
  }

  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return growthJsonError("google_ads_customer_id not set in growth_settings", "BAD_REQUEST", 400);
  }

  const trimmedCustomerId = customerId.trim();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const dailyKey = `${yyyy}-${mm}-${dd}:${trimmedCustomerId}`;

  if (!options.force) {
    const lastDailyKey = await getGrowthSetting(LAST_DAILY_KEY);
    if (lastDailyKey != null && String(lastDailyKey).trim() === dailyKey) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already_ran",
      });
    }
  }

  const { error: markerError } = await supabase
    .from("growth_settings")
    .upsert(
      { key: LAST_DAILY_KEY, value: dailyKey, updated_at: now.toISOString() },
      { onConflict: "key" }
    );
  if (markerError) {
    return growthJsonError(markerError.message, "INTERNAL_ERROR", 500);
  }

  const autoApplyEnabled = await getGrowthSettingBoolean("ads_optimizer_auto_apply_enabled", true);
  const enqueued: string[] = [];

  try {
    const { jobId: reportJob } = await enqueueJob(
      { type: "google_ads_report", payload: { queryId: "campaign_performance" } },
      supabase
    );
    enqueued.push(`report:${reportJob}`);

    const { jobId: convJob } = await enqueueJob(
      { type: "google_ads_conversion_actions_refresh", payload: {} },
      supabase
    );
    enqueued.push(`conversion_actions:${convJob}`);

    const { jobId: searchTermsJob } = await enqueueJob(
      { type: "google_ads_search_terms_refresh", payload: {} },
      supabase
    );
    enqueued.push(`search_terms:${searchTermsJob}`);

    const { jobId: planJob } = await enqueueJob(
      { type: "google_ads_optimizer_plan", payload: { force: options.force } },
      supabase
    );
    enqueued.push(`optimizer_plan:${planJob}`);

    if (autoApplyEnabled) {
      const { jobId: autoApplyJob } = await enqueueJob(
        { type: "google_ads_optimizer_auto_apply", payload: {} },
        supabase
      );
      enqueued.push(`auto_apply:${autoApplyJob}`);
    }

    const { jobId: trafficJob } = await enqueueJob(
      { type: "traffic_quality_monitor", payload: {} },
      supabase
    );
    enqueued.push(`traffic_quality:${trafficJob}`);

    const { jobId: anomalyJob } = await enqueueJob(
      { type: "google_ads_anomaly_check", payload: {} },
      supabase
    );
    enqueued.push(`anomaly:${anomalyJob}`);

    const runAfter = new Date();
    runAfter.setMinutes(runAfter.getMinutes() + DIGEST_DELAY_MINUTES);
    const { jobId: digestJob } = await enqueueJob(
      { type: "google_ads_optimizer_daily_digest", payload: { attempt: 0 }, runAfter },
      supabase
    );
    enqueued.push(`daily_digest:${digestJob}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }

  return NextResponse.json({
    ok: true,
    customerId: trimmedCustomerId,
    dailyKey,
    autoApplyEnabled,
    enqueued,
  });
}
