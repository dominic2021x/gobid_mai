import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingMatchesQuery } from "@/lib/server/products/listingsRepo";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import { sendUserPushNotification } from "@/lib/push/sendUserPushNotification";
import { enqueueJob } from "@/lib/growth/jobs";
import { buildAlertFeatures } from "@/lib/alerts/ranking/features";
import { scoreAlert, SCORE_THRESHOLD } from "@/lib/alerts/ranking/scoreAlert";
import { fetchQueryStatsMap, fetchUserProfilesMap } from "@/lib/alerts/ranking/fetchRankingData";

const SCAN_LIMIT = 500;
const NEW_LISTINGS_LIMIT = 500;
const INSTANT_TOP_N = 5;
const PER_USER_DAILY_CAP = 20;

interface SavedSearchRow {
  id: string;
  user_id: string;
  q_norm: string;
  filters_json: Record<string, unknown>;
  last_checked_at: string;
  delivery_mode: string | null;
  cooldown_minutes: number | null;
}

/**
 * Run saved search alerts: dedupe via saved_search_alerts_sent, cooldown, per-user cap,
 * top-N instant per search, digest queue for rest.
 */
export async function runSavedSearchAlerts(supabase?: SupabaseClient): Promise<{
  ok: boolean;
  processed: number;
  notified: number;
  digestQueued: number;
  error?: string;
}> {
  const db = supabase ?? createAdminClient();
  const nowIso = new Date().toISOString();
  const now = new Date();

  const { data: savedSearches, error: fetchErr } = await db
    .from("user_saved_searches")
    .select("id, user_id, q_norm, filters_json, last_checked_at, delivery_mode, cooldown_minutes")
    .order("last_checked_at", { ascending: true })
    .limit(SCAN_LIMIT);

  if (fetchErr) {
    return { ok: false, processed: 0, notified: 0, digestQueued: 0, error: fetchErr.message };
  }
  if (!savedSearches?.length) {
    return { ok: true, processed: 0, notified: 0, digestQueued: 0 };
  }

  const searches = savedSearches as SavedSearchRow[];
  const eligibleSearches = searches.filter((s) => {
    const mins = s.cooldown_minutes ?? 60;
    const cutoff = new Date(now.getTime() - mins * 60 * 1000);
    return new Date(s.last_checked_at).getTime() <= cutoff.getTime();
  });

  if (eligibleSearches.length === 0) {
    return { ok: true, processed: searches.length, notified: 0, digestQueued: 0 };
  }

  const minLastChecked = eligibleSearches.reduce(
    (min, s) => {
      const t = s.last_checked_at;
      return !t || (min && t < min) ? min : t ?? min;
    },
    eligibleSearches[0]?.last_checked_at ?? nowIso
  );

  let q = db
    .from("products")
    .select("id, title, slug, url, category, subcategory, category_level_3, county, city, product_location, brand, model, size, color, condition, starting_price_ron, product_type, sale_type, custom_fields, attributes, created_at, channel")
    .gte("created_at", minLastChecked)
    .in("status", ["active", "reserved", "in_progress"])
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(NEW_LISTINGS_LIMIT);
  q = q.or("channel.eq.ro,channel.eq.executari_insolventa");
  const { data: newListings, error: listingsErr } = await q;

  if (listingsErr || !newListings?.length) {
    for (const s of eligibleSearches) {
      await db.from("user_saved_searches").update({ last_checked_at: nowIso }).eq("id", s.id);
    }
    return { ok: true, processed: searches.length, notified: 0, digestQueued: 0 };
  }

  const listings = newListings as Record<string, unknown>[];
  const listingIds = listings.map((r) => String(r.id ?? "")).filter(Boolean);
  const searchIds = eligibleSearches.map((s) => s.id);

  const { data: alreadySent } = await db
    .from("saved_search_alerts_sent")
    .select("saved_search_id, listing_id")
    .in("saved_search_id", searchIds)
    .in("listing_id", listingIds);

  const sentSet = new Set<string>();
  for (const row of alreadySent ?? []) {
    sentSet.add(`${(row as { saved_search_id: string }).saved_search_id}:${(row as { listing_id: string }).listing_id}`);
  }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAlerts } = await db
    .from("user_notifications")
    .select("user_id")
    .eq("type", "saved_search_alert")
    .gte("created_at", dayAgo);

  const alertsPerUser = new Map<string, number>();
  for (const r of recentAlerts ?? []) {
    const uid = (r as { user_id: string }).user_id;
    alertsPerUser.set(uid, (alertsPerUser.get(uid) ?? 0) + 1);
  }

  const qNorms = [...new Set(eligibleSearches.map((s) => s.q_norm).filter(Boolean))];
  const userIds = [...new Set(eligibleSearches.map((s) => s.user_id))];
  const [queryStatsMap, userProfilesMap] = await Promise.all([
    fetchQueryStatsMap(db, qNorms),
    fetchUserProfilesMap(db, userIds),
  ]);

  const toInsertSent: { saved_search_id: string; listing_id: string }[] = [];
  const toInsertNotif: { user_id: string; type: string; title: string; message: string; metadata: Record<string, unknown> }[] = [];
  const toEnqueueDigest: { saved_search_id: string; user_id: string; listing_ids: string[]; delivery_mode: string }[] = [];
  let totalNotified = 0;

  for (const search of eligibleSearches) {
    const mode = search.delivery_mode ?? "instant";
    const lastChecked = search.last_checked_at || minLastChecked;
    const query: ProductQuery = {
      q: search.q_norm,
      ...(search.filters_json as Partial<ProductQuery>),
    };

    const rawMatching = listings.filter(
      (row) =>
        new Date(String(row.created_at ?? "")).getTime() > new Date(lastChecked).getTime() &&
        listingMatchesQuery(row, query) &&
        !sentSet.has(`${search.id}:${row.id}`)
    );

    const queryStats = queryStatsMap.get(search.q_norm) ?? null;
    const userProfile = userProfilesMap.get(search.user_id) ?? null;
    const scored = rawMatching
      .map((row) => {
        const features = buildAlertFeatures({
          listing: row as { id: string; county?: string; city?: string; category?: string; created_at?: string },
          savedSearch: { q_norm: search.q_norm, filters_json: search.filters_json },
          userProfile,
          queryStats,
        });
        return { row, score: scoreAlert(features) };
      })
      .filter((x) => x.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matching = scored.map((x) => x.row);

    if (matching.length === 0) {
      await db.from("user_saved_searches").update({ last_checked_at: nowIso }).eq("id", search.id);
      continue;
    }

    const userCap = PER_USER_DAILY_CAP - (alertsPerUser.get(search.user_id) ?? 0);
    if (userCap <= 0 && mode === "instant") {
      toEnqueueDigest.push({
        saved_search_id: search.id,
        user_id: search.user_id,
        listing_ids: matching.map((r) => String(r.id)),
        delivery_mode: "daily_digest",
      });
      await db.from("user_saved_searches").update({ last_checked_at: nowIso }).eq("id", search.id);
      continue;
    }

    if (mode === "instant") {
      const instant = matching.slice(0, Math.min(INSTANT_TOP_N, userCap));
      for (const row of instant) {
        const lid = String(row.id);
        toInsertSent.push({ saved_search_id: search.id, listing_id: lid });
        sentSet.add(`${search.id}:${lid}`);
      }
      const rest = matching.slice(instant.length);
      if (rest.length > 0) {
        toEnqueueDigest.push({
          saved_search_id: search.id,
          user_id: search.user_id,
          listing_ids: rest.map((r) => String(r.id)),
          delivery_mode: "daily_digest",
        });
      }

      if (instant.length > 0) {
        const first = instant[0] as { id?: string; title?: string; slug?: string };
        const title =
          instant.length === 1
            ? "Anunț nou care se potrivește căutării tale"
            : `${instant.length} anunțuri noi pentru căutarea ta`;
        const body =
          instant.length === 1
            ? String(first.title ?? "").slice(0, 80) + (String(first.title ?? "").length > 80 ? "..." : "")
            : `Vezi cele ${instant.length} anunțuri noi`;
        const slug = first?.slug ?? first?.id ?? "";
        const url = slug ? `/live_bid/${slug}` : "/ro";

        toInsertNotif.push({
          user_id: search.user_id,
          type: "saved_search_alert",
          title,
          message: body,
          metadata: {
            search_id: search.id,
            q_norm: search.q_norm,
            count: instant.length,
            url: url.startsWith("/") ? `https://gobid.ro${url}` : url,
          },
        });
        alertsPerUser.set(search.user_id, (alertsPerUser.get(search.user_id) ?? 0) + 1);
        totalNotified++;

        sendUserPushNotification({
          userId: search.user_id,
          title,
          body,
          data: { type: "saved_search_alert", url: url.startsWith("/") ? url : `/${url}` },
        }).catch(() => {});
      }
    } else {
      toEnqueueDigest.push({
        saved_search_id: search.id,
        user_id: search.user_id,
        listing_ids: matching.map((r) => String(r.id)),
        delivery_mode: mode,
      });
    }

    await db.from("user_saved_searches").update({ last_checked_at: nowIso }).eq("id", search.id);
  }

  for (const s of searches) {
    if (!eligibleSearches.some((e) => e.id === s.id)) {
      await db.from("user_saved_searches").update({ last_checked_at: nowIso }).eq("id", s.id);
    }
  }

  if (toInsertSent.length > 0) {
    await db.from("saved_search_alerts_sent").upsert(toInsertSent.map((r) => ({ ...r, sent_at: nowIso })), {
      onConflict: "saved_search_id,listing_id",
      ignoreDuplicates: true,
    });
  }

  if (toInsertNotif.length > 0) {
    await db.from("user_notifications").insert(toInsertNotif);
  }

  let digestQueued = 0;
  for (const d of toEnqueueDigest) {
    if (d.listing_ids.length > 0) {
      await enqueueJob(
        {
          type: "saved_search_digest_build",
          payload: {
            saved_search_id: d.saved_search_id,
            user_id: d.user_id,
            listing_ids: d.listing_ids,
            delivery_mode: d.delivery_mode,
          },
        },
        db
      );
      digestQueued++;
    }
  }

  return {
    ok: true,
    processed: searches.length,
    notified: totalNotified,
    digestQueued,
  };
}
