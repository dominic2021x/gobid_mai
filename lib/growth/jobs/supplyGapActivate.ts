import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const TOP_GAPS_LIMIT = 50;
const QUALITY_THRESHOLD = 2;
const SELLER_DAYS = 90;
const NOTIFY_THROTTLE_DAYS = 7;
const NOTIFICATION_TYPE = "supply_gap_suggest";

/**
 * Run supply gap activation: pick top gaps, find candidate sellers, throttle, send notifications.
 */
export async function runSupplyGapActivate(supabase?: SupabaseClient): Promise<{
  ok: boolean;
  gapsProcessed: number;
  actionsCreated: number;
  notificationsSent: number;
  error?: string;
}> {
  const db = supabase ?? createAdminClient();
  const sinceSellers = new Date(Date.now() - SELLER_DAYS * 86400 * 1000).toISOString();
  const sinceThrottle = new Date(Date.now() - NOTIFY_THROTTLE_DAYS * 86400 * 1000).toISOString();

  try {
    const { data: gaps, error: gapsError } = await db
      .from("market_supply_gaps")
      .select("id, q_norm, category_slug, search_demand, listing_supply")
      .eq("action_state", "new")
      .gte("quality_score", QUALITY_THRESHOLD)
      .order("gap_score", { ascending: false })
      .limit(TOP_GAPS_LIMIT);

    if (gapsError || !gaps?.length) {
      return { ok: true, gapsProcessed: 0, actionsCreated: 0, notificationsSent: 0 };
    }

    let actionsCreated = 0;
    let notificationsSent = 0;

    for (const gap of gaps) {
      const categorySlug = gap.category_slug?.trim() || null;
      const qNorm = String(gap.q_norm ?? "").trim();
      let candidateUserIds: string[] = [];

      if (categorySlug) {
        const slugEsc = String(categorySlug).replace(/,/g, "").trim();
        const { data: sellers } = await db
          .from("products")
          .select("user_id")
          .in("status", ["active", "reserved", "sold", "in_progress"])
          .gte("created_at", sinceSellers)
          .not("user_id", "is", null)
          .or(`category.eq.${slugEsc},category.ilike.${slugEsc}%`);
        const seen = new Set<string>();
        for (const r of sellers ?? []) {
          const uid = (r as { user_id: string }).user_id;
          if (uid) seen.add(uid);
        }
        candidateUserIds = [...seen];
      }
      if (candidateUserIds.length === 0 && qNorm.length >= 3) {
        const termEsc = qNorm.replace(/%|_/g, "").slice(0, 50);
        const { data: sellersByQ } = await db
          .from("products")
          .select("user_id")
          .in("status", ["active", "reserved", "sold", "in_progress"])
          .gte("created_at", sinceSellers)
          .not("user_id", "is", null)
          .or(`title.ilike.%${termEsc}%,category.ilike.%${termEsc}%,subcategory.ilike.%${termEsc}%`);
        const seen = new Set<string>();
        for (const r of sellersByQ ?? []) {
          const uid = (r as { user_id: string }).user_id;
          if (uid) seen.add(uid);
        }
        candidateUserIds = [...seen];
      }

      if (candidateUserIds.length === 0) {
        await db.from("market_supply_gap_actions").insert({
          gap_id: gap.id,
          type: "notify_sellers",
          status: "skipped",
          payload: { reason: "no_candidates" },
        });
        actionsCreated++;
        continue;
      }

      const { data: recentNotifs } = await db
        .from("user_notifications")
        .select("user_id")
        .eq("type", NOTIFICATION_TYPE)
        .gte("created_at", sinceThrottle)
        .in("user_id", candidateUserIds);
      const throttled = new Set((recentNotifs ?? []).map((r: { user_id: string }) => r.user_id));
      const toNotify = candidateUserIds.filter((uid) => !throttled.has(uid));

      if (toNotify.length === 0) {
        await db.from("market_supply_gap_actions").insert({
          gap_id: gap.id,
          type: "notify_sellers",
          status: "skipped",
          payload: { reason: "throttled", candidateCount: candidateUserIds.length },
        });
        actionsCreated++;
        continue;
      }

      const limit = Math.min(toNotify.length, 100);
      const batch = toNotify.slice(0, limit);
      const title = "Oportunitate nouă pe gobid.ro";
      const message = `Cautările pentru „${gap.q_norm}” cresc, dar există puține anunțuri. Adaugă un anunț acum.`;
      const notifications = batch.map((userId) => ({
        user_id: userId,
        title,
        message,
        type: NOTIFICATION_TYPE,
        metadata: { gap_id: gap.id, q_norm: gap.q_norm, action_type: "suggest_listing" },
      }));

      const { error: notifError } = await db.from("user_notifications").insert(notifications);
      if (notifError) {
        await db.from("market_supply_gap_actions").insert({
          gap_id: gap.id,
          type: "notify_sellers",
          status: "skipped",
          payload: { reason: "insert_failed", error: notifError.message },
        });
        actionsCreated++;
        continue;
      }

      notificationsSent += notifications.length;

      await db.from("market_supply_gap_actions").insert({
        gap_id: gap.id,
        type: "notify_sellers",
        status: "sent",
        payload: { notified: notifications.length },
      });
      actionsCreated++;

      await db
        .from("market_supply_gaps")
        .update({ action_state: "activated" })
        .eq("id", gap.id);
    }

    return {
      ok: true,
      gapsProcessed: gaps.length,
      actionsCreated,
      notificationsSent,
    };
  } catch (err) {
    return {
      ok: false,
      gapsProcessed: 0,
      actionsCreated: 0,
      notificationsSent: 0,
      error: (err as Error).message,
    };
  }
}
