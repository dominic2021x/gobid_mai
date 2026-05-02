import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const DECAY = 0.98;
const CAP_EVENTS = 10000;
const ROLLUP_DAY_MS = 86400 * 1000;
const TOP_N = 50;

export async function handleSearchPersonalRollupDaily(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const since = new Date(Date.now() - ROLLUP_DAY_MS).toISOString();
    const { data: optIn } = await supabase
      .from("search_personal_opt_in")
      .select("user_id")
      .eq("enabled", true);
    const userIds = new Set((optIn ?? []).map((r: { user_id: string }) => r.user_id));
    if (userIds.size === 0) {
      await supabase.from("growth_events").insert({
        type: "search_personal_rollup_daily",
        meta: { correlationId, usersUpdated: 0 },
      });
      return { ok: true, meta: { usersUpdated: 0 } };
    }
    const { data: events } = await supabase
      .from("search_events")
      .select("impression_id, payload")
      .in("type", ["click", "satisfaction"])
      .gte("created_at", since)
      .limit(CAP_EVENTS);
    const eventsList = (events ?? []) as Array<{ impression_id: string | null; payload: { listingId?: string } }>;
    const impIds = [...new Set(eventsList.map((e) => e.impression_id).filter(Boolean))] as string[];
    const { data: impressions } = await supabase
      .from("search_impressions")
      .select("impression_id, user_id, q_norm")
      .in("impression_id", impIds.length ? impIds : ["00000000-0000-0000-0000-000000000000"]);
    const impMap = new Map<string, { user_id: string | null; q_norm: string }>();
    for (const i of impressions ?? []) {
      const row = i as { impression_id: string; user_id: string | null; q_norm: string };
      impMap.set(row.impression_id, { user_id: row.user_id, q_norm: row.q_norm ?? "" });
    }
    const listingIds = [...new Set(eventsList.map((e) => e.payload?.listingId).filter(Boolean))] as string[];
    const listingMeta = new Map<string, { category: string; county: string }>();
    if (listingIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, category, county")
        .in("id", listingIds.slice(0, 5000));
      for (const p of products ?? []) {
        const row = p as { id: string; category?: string; county?: string };
        listingMeta.set(row.id, { category: (row.category ?? "").trim(), county: (row.county ?? "").trim() });
      }
    }
    const byUser = new Map<
      string,
      { categories: Map<string, number>; counties: Map<string, number>; queries: Map<string, number> }
    >();
    for (const e of eventsList) {
      const imp = e.impression_id ? impMap.get(e.impression_id) : null;
      const uid = imp?.user_id ?? null;
      if (!uid || !userIds.has(uid)) continue;
      let cur = byUser.get(uid);
      if (!cur) {
        cur = { categories: new Map(), counties: new Map(), queries: new Map() };
        byUser.set(uid, cur);
      }
      const q = (imp?.q_norm ?? "").trim().slice(0, 120);
      if (q) cur.queries.set(q, (cur.queries.get(q) ?? 0) + 1);
      const lid = e.payload?.listingId;
      if (lid) {
        const meta = listingMeta.get(lid);
        if (meta?.category) cur.categories.set(meta.category, (cur.categories.get(meta.category) ?? 0) + 1);
        if (meta?.county) cur.counties.set(meta.county, (cur.counties.get(meta.county) ?? 0) + 1);
      }
    }
    let usersUpdated = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const [userId, data] of byUser) {
      const { data: profile } = await supabase
        .from("user_search_profiles")
        .select("prefs")
        .eq("user_id", userId)
        .maybeSingle();
      const existing = (profile as { prefs?: { category?: Record<string, number>; county?: Record<string, number>; query?: Record<string, number> } } | null)?.prefs ?? {};
      const catPrev = (existing.category && typeof existing.category === "object") ? existing.category : {};
      const countyPrev = (existing.county && typeof existing.county === "object") ? existing.county : {};
      const queryPrev = (existing.query && typeof existing.query === "object") ? existing.query : {};
      const catNew: Record<string, number> = {};
      for (const [k, v] of Object.entries(catPrev)) catNew[k] = (v ?? 0) * DECAY;
      for (const [k, v] of data.categories) catNew[k] = (catNew[k] ?? 0) + v;
      const countyNew: Record<string, number> = {};
      for (const [k, v] of Object.entries(countyPrev)) countyNew[k] = (v ?? 0) * DECAY;
      for (const [k, v] of data.counties) countyNew[k] = (countyNew[k] ?? 0) + v;
      const queryNew: Record<string, number> = {};
      for (const [k, v] of Object.entries(queryPrev)) queryNew[k] = (v ?? 0) * DECAY;
      for (const [k, v] of data.queries) queryNew[k] = (queryNew[k] ?? 0) + v;
      const topCategories = Object.entries(catNew)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_N)
        .map(([k, v]) => ({ k, v }));
      const topCounties = Object.entries(countyNew)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_N)
        .map(([k, v]) => ({ k, v }));
      const topQueries = Object.entries(queryNew)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_N)
        .map(([k, v]) => ({ k, v }));
      await supabase.from("user_search_profiles").upsert(
        {
          user_id: userId,
          prefs: { category: catNew, county: countyNew, query: queryNew },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      await supabase.from("user_search_events_rollup").upsert(
        {
          user_id: userId,
          day: today,
          top_categories: topCategories,
          top_counties: topCounties,
          top_queries: topQueries,
        },
        { onConflict: "user_id,day" }
      );
      usersUpdated += 1;
    }
    await supabase.from("growth_events").insert({
      type: "search_personal_rollup_daily",
      meta: { correlationId, usersUpdated },
    });
    return { ok: true, meta: { usersUpdated } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({
      type: "search_personal_rollup_daily_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
