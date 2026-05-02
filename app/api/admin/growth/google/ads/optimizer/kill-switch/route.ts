import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const KEYS = {
  enabled: "ads_optimizer_enabled",
  autoApplyEnabled: "ads_optimizer_auto_apply_enabled",
  killCampaignIds: "ads_optimizer_kill_campaign_ids",
  pilotCampaignIds: "ads_optimizer_pilot_campaign_ids",
} as const;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: {
    enabled?: boolean;
    autoApplyEnabled?: boolean;
    killCampaignIds?: string[];
    pilotCampaignIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  if (body == null || typeof body !== "object") {
    return growthJsonError("Body must be an object", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const updates: Array<{ key: string; value: unknown }> = [];
  if (typeof body.enabled === "boolean") {
    updates.push({ key: KEYS.enabled, value: body.enabled });
  }
  if (typeof body.autoApplyEnabled === "boolean") {
    updates.push({ key: KEYS.autoApplyEnabled, value: body.autoApplyEnabled });
  }
  if (Array.isArray(body.killCampaignIds)) {
    const ids = body.killCampaignIds.map((x) => (x != null ? String(x).trim() : "")).filter(Boolean);
    updates.push({ key: KEYS.killCampaignIds, value: ids });
  }
  if (Array.isArray(body.pilotCampaignIds)) {
    const ids = body.pilotCampaignIds.map((x) => (x != null ? String(x).trim() : "")).filter(Boolean);
    updates.push({ key: KEYS.pilotCampaignIds, value: ids });
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, updated: [] });
  }

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from("growth_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  }

  await supabase.from("growth_events").insert({
    type: "google_ads_optimizer_kill_switch",
    meta: {
      updated: updates.map((u) => u.key),
      enabled: body.enabled,
      autoApplyEnabled: body.autoApplyEnabled,
      killCampaignIds: Array.isArray(body.killCampaignIds) ? body.killCampaignIds : undefined,
      pilotCampaignIds: Array.isArray(body.pilotCampaignIds) ? body.pilotCampaignIds : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    updated: updates.map((u) => u.key),
  });
}
