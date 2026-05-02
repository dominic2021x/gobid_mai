import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendUserPushNotification } from "@/lib/push/sendUserPushNotification";
import { buildAlertFeatures } from "@/lib/alerts/ranking/features";
import { scoreAlert, getWhyTags } from "@/lib/alerts/ranking/scoreAlert";
import { fetchQueryStatsMap, fetchUserProfilesMap } from "@/lib/alerts/ranking/fetchRankingData";

const CLAIM_LIMIT = 200;
const LISTINGS_PER_USER_CAP = 20;

type DigestMode = "daily_digest" | "weekly_digest";

interface DigestRow {
  id: string;
  saved_search_id: string;
  user_id: string;
  listing_id: string;
}

/**
 * Run saved search digest send: claim unconsumed rows, group by user, fetch listings,
 * send digest (push + in-app), mark consumed, log growth_event.
 */
export async function runSavedSearchDigestSend(
  supabase: SupabaseClient,
  opts: { mode: DigestMode; correlationId: string }
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const { mode, correlationId } = opts;
  const now = new Date().toISOString();

  try {
    const { data: rows, error: claimErr } = await supabase
      .from("saved_search_digest_queue")
      .select("id, saved_search_id, user_id, listing_id")
      .eq("delivery_mode", mode)
      .is("consumed_at", null)
      .lte("available_at", now)
      .limit(CLAIM_LIMIT);

    if (claimErr) {
      return { ok: false, error: claimErr.message };
    }

    const queueRows = (rows ?? []) as DigestRow[];
    if (queueRows.length === 0) {
      await supabase.from("growth_events").insert({
        type: "saved_search_digest_sent",
        meta: { correlationId, mode, claimed: 0, usersNotified: 0 },
      });
      return { ok: true, meta: { claimed: 0, usersNotified: 0 } };
    }

    const ids = queueRows.map((r) => r.id);

    const byUser = new Map<string, { listingIds: Set<string>; savedSearchIds: Set<string>; listingToSearch: Map<string, string> }>();
    for (const r of queueRows) {
      let entry = byUser.get(r.user_id);
      if (!entry) {
        entry = { listingIds: new Set(), savedSearchIds: new Set(), listingToSearch: new Map() };
        byUser.set(r.user_id, entry);
      }
      entry.listingIds.add(r.listing_id);
      entry.savedSearchIds.add(r.saved_search_id);
      if (!entry.listingToSearch.has(r.listing_id)) {
        entry.listingToSearch.set(r.listing_id, r.saved_search_id);
      }
    }

    const savedSearchIds = [...new Set(queueRows.map((r) => r.saved_search_id))];
    const { data: savedSearches } = await supabase
      .from("user_saved_searches")
      .select("id, q_norm, filters_json")
      .in("id", savedSearchIds);
    const searchMap = new Map<string, { q_norm: string; filters_json: Record<string, unknown> }>();
    for (const s of savedSearches ?? []) {
      const row = s as { id: string; q_norm: string; filters_json?: Record<string, unknown> };
      searchMap.set(row.id, { q_norm: row.q_norm, filters_json: row.filters_json ?? {} });
    }

    const allListingIds = [...new Set(queueRows.map((r) => r.listing_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, title, slug, starting_price_ron, county, city, category, created_at")
      .in("id", allListingIds);

    const listingsMap = new Map<
      string,
      { title: string; slug: string; price?: number; county?: string; city?: string; category?: string; created_at?: string }
    >();
    for (const p of products ?? []) {
      const row = p as {
        id: string;
        title?: string;
        slug?: string;
        starting_price_ron?: number;
        county?: string;
        city?: string;
        category?: string;
        created_at?: string;
      };
      listingsMap.set(row.id, {
        title: String(row.title ?? ""),
        slug: String(row.slug ?? ""),
        price: typeof row.starting_price_ron === "number" ? row.starting_price_ron : undefined,
        county: row.county,
        city: row.city,
        category: row.category,
        created_at: row.created_at,
      });
    }

    const qNorms = [...new Set([...searchMap.values()].map((s) => s.q_norm).filter(Boolean))];
    const userIds = [...byUser.keys()];
    const [queryStatsMap, userProfilesMap] = await Promise.all([
      fetchQueryStatsMap(supabase, qNorms),
      fetchUserProfilesMap(supabase, userIds),
    ]);

    let prefsMap = new Map<string, { push_enabled: boolean; email_enabled: boolean }>();
    const prefsRes = await supabase
      .from("user_notification_prefs")
      .select("user_id, push_enabled, email_enabled")
      .in("user_id", [...byUser.keys()]);
    if (!prefsRes.error || prefsRes.error.code !== "42P01") {
      for (const p of prefsRes.data ?? []) {
        const row = p as { user_id: string; push_enabled?: boolean; email_enabled?: boolean };
        prefsMap.set(row.user_id, {
          push_enabled: row.push_enabled !== false,
          email_enabled: row.email_enabled !== false,
        });
      }
    }

    const notifications: { user_id: string; type: string; title: string; message: string; metadata: Record<string, unknown> }[] = [];
    let usersNotified = 0;

    for (const [userId, entry] of byUser.entries()) {
      const prefs = prefsMap.get(userId) ?? { push_enabled: true, email_enabled: false };
      if (!prefs.push_enabled && !prefs.email_enabled) continue;

      const userProfile = userProfilesMap.get(userId) ?? null;
      const scoredListings: { id: string; score: number; whyTags: string[] }[] = [];
      for (const lid of entry.listingIds) {
        const listing = listingsMap.get(lid);
        if (!listing) continue;
        const searchId = entry.listingToSearch.get(lid);
        const search = searchId ? searchMap.get(searchId) : null;
        const queryStats = search ? queryStatsMap.get(search.q_norm) ?? null : null;
        const features = buildAlertFeatures({
          listing: { id: lid, county: listing.county, city: listing.city, category: listing.category, created_at: listing.created_at },
          savedSearch: search ?? { q_norm: "", filters_json: {} },
          userProfile,
          queryStats,
        });
        scoredListings.push({ id: lid, score: scoreAlert(features), whyTags: getWhyTags(features) });
      }
      scoredListings.sort((a, b) => b.score - a.score);
      const topListingIds = scoredListings.slice(0, LISTINGS_PER_USER_CAP).map((x) => x.id);
      const whyByListing = Object.fromEntries(scoredListings.slice(0, LISTINGS_PER_USER_CAP).map((x) => [x.id, x.whyTags]));

      const items = topListingIds.map((lid) => listingsMap.get(lid)).filter(Boolean);
      const count = items.length;
      if (count === 0) continue;

      const label = mode === "daily_digest" ? "Zilnic" : "Săptămânal";
      const title = `${count} anunțuri noi - digest ${label}`;
      const lines = items.slice(0, 5).map((l) => `• ${(l!.title || "").slice(0, 50)}${(l!.title || "").length > 50 ? "..." : ""}`).join("\n");
      const body = `${lines}${count > 5 ? `\n... și încă ${count - 5}` : ""}`;

      notifications.push({
        user_id: userId,
        type: "saved_search_digest",
        title,
        message: body,
        metadata: { mode, count, listing_ids: topListingIds, search_ids: [...entry.savedSearchIds], why_tags: whyByListing },
      });
      usersNotified++;

      if (prefs.push_enabled) {
        sendUserPushNotification({
          userId,
          title,
          body: body.slice(0, 150),
          data: { type: "saved_search_digest", url: "/ro" },
        }).catch(() => {});
      }
    }

    if (notifications.length > 0) {
      await supabase.from("user_notifications").insert(notifications);
    }

    await supabase
      .from("saved_search_digest_queue")
      .update({ consumed_at: now })
      .in("id", ids);

    await supabase.from("growth_events").insert({
      type: "saved_search_digest_sent",
      meta: { correlationId, mode, claimed: queueRows.length, usersNotified },
    });

    return {
      ok: true,
      meta: { claimed: queueRows.length, usersNotified },
    };
  } catch (err) {
    const msg = (err as Error).message;
    await supabase.from("growth_events").insert({
      type: "saved_search_digest_sent_failed",
      meta: { correlationId, mode, error: msg.slice(0, 500) },
    });
    return { ok: false, error: msg };
  }
}
