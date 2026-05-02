import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import { enqueueJob } from "@/lib/growth/jobs";

const CAP_ACTIONS = 100;
const LOW_CTR_THRESHOLD = 0.02;
const HIGH_DEMAND_MIN = 0.5;
const DAYS_STATS = 7;
const DECAY_HALFLIFE_DAYS = 7;
const SUPPLY_SNAPSHOT_RETENTION_DAYS = 14;

function getCountyNameMap(): Map<string, string> {
  try {
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const p = path.join(process.cwd(), "judete.json");
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as { judete?: Array<{ nume?: string }> };
    const map = new Map<string, string>();
    for (const j of data.judete ?? []) {
      const name = (j.nume ?? "").trim();
      if (!name) continue;
      const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      map.set(slug, name);
    }
    return map;
  } catch {
    return new Map<string, string>();
  }
}

function slugFromQueryNorm(qNorm: string): string {
  return qNorm
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "cautare";
}

export async function handleDemandFlywheelRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - DAYS_STATS * 86400 * 1000).toISOString().slice(0, 10);
    const supplySnapshotDate = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const pruneBefore = new Date(Date.now() - SUPPLY_SNAPSHOT_RETENTION_DAYS * 86400 * 1000).toISOString().slice(0, 10);

    const [statsRes, demandRes, trendRes, lpsRes, pendingRes, supply7dRes] = await Promise.all([
      supabase.from("search_intel_query_stats").select("q_norm, day, impressions, clicks, ctr").gte("day", since).limit(10000),
      supabase.from("growth_demand_opportunities").select("q_norm, demand_score, recommended_action, category_slug, county_slug").in("status", ["new", "accepted"]).order("demand_score", { ascending: false }).limit(500),
      supabase.from("growth_trend_items").select("q_norm, spike_score, recommended_actions, category_slug, county_slug").in("status", ["new", "accepted"]).order("spike_score", { ascending: false }).limit(300),
      supabase.from("seo_landing_pages").select("slug"),
      supabase.from("growth_demand_actions").select("type, q_norm").eq("status", "pending"),
      supabase.from("growth_demand_supply_snapshot").select("q_norm, category_slug, county_slug, supply").eq("snapshot_date", supplySnapshotDate),
    ]);
    const statsRows = (statsRes.data ?? []) as Array<{ q_norm: string; day: string; impressions: number; clicks: number; ctr: number }>;
    const demandRows = (demandRes.data ?? []) as Array<{ q_norm: string; demand_score: number; recommended_action: string; category_slug: string | null; county_slug: string | null }>;
    const trendRows = (trendRes.data ?? []) as Array<{ q_norm: string; spike_score: number; recommended_actions: string[]; category_slug: string | null; county_slug: string | null }>;
    const lpSlugs = new Set((lpsRes.data ?? []).map((r: { slug: string }) => r.slug));
    const pendingSet = new Set<string>();
    for (const r of pendingRes.data ?? []) {
      const row = r as { type: string; q_norm: string | null };
      if (row.q_norm) pendingSet.add(`${row.type}\t${row.q_norm}`);
    }
    const supply7dByKey = new Map<string, number>();
    for (const r of supply7dRes.data ?? []) {
      const row = r as { q_norm: string; category_slug: string | null; county_slug: string | null; supply: number };
      const key = `${row.q_norm}\t${row.category_slug ?? ""}\t${row.county_slug ?? ""}`;
      supply7dByKey.set(key, Number(row.supply) ?? 0);
    }

    const ctrByQ = new Map<string, number>();
    const maxDayByQ = new Map<string, string>();
    for (const r of statsRows) {
      const imp = Number(r.impressions) || 0;
      const clk = Number(r.clicks) || 0;
      const ctr = imp > 0 ? clk / imp : 0;
      const cur = ctrByQ.get(r.q_norm);
      if (cur == null || imp > 0) ctrByQ.set(r.q_norm, ctr);
      const existing = maxDayByQ.get(r.q_norm);
      if (!existing || (r.day as string) > existing) maxDayByQ.set(r.q_norm, r.day as string);
    }

    const countyMap = getCountyNameMap();
    const seen = new Set<string>();
    const candidates: Array<{ q_norm: string; demand_score: number; category_slug: string | null; county_slug: string | null }> = [];
    for (const r of demandRows) {
      const key = `${r.q_norm}\t${r.category_slug ?? ""}\t${r.county_slug ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          q_norm: r.q_norm,
          demand_score: Number(r.demand_score) || 0,
          category_slug: r.category_slug ?? null,
          county_slug: r.county_slug ?? null,
        });
      }
    }
    for (const r of trendRows) {
      const key = `${r.q_norm}\t${r.category_slug ?? ""}\t${r.county_slug ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          q_norm: r.q_norm,
          demand_score: Number(r.spike_score) || 0,
          category_slug: r.category_slug ?? null,
          county_slug: r.county_slug ?? null,
        });
      }
    }

    const actions: Array<{ type: string; q_norm: string; demand_score: number; supply_count: number; payload: Record<string, unknown> }> = [];
    const supplyRowsToSnapshot: Array<{ q_norm: string; category_slug: string | null; county_slug: string | null; supply: number }> = [];

    for (let i = 0; i < candidates.length && actions.length < CAP_ACTIONS; i++) {
      const { q_norm, demand_score, category_slug, county_slug } = candidates[i];
      const maxDay = maxDayByQ.get(q_norm);
      const daysSince = maxDay ? (Date.parse(today) - Date.parse(maxDay)) / 86400 / 1000 : 0;
      const effectiveScore = demand_score * Math.exp(-daysSince / DECAY_HALFLIFE_DAYS);

      const countyName = county_slug ? (countyMap.get(county_slug) ?? county_slug) : "";
      const supply = await countProducts(
        { categorie: category_slug ?? undefined, county: countyName || undefined },
        undefined
      );
      const supplyKey = `${q_norm}\t${category_slug ?? ""}\t${county_slug ?? ""}`;
      supplyRowsToSnapshot.push({ q_norm, category_slug, county_slug, supply });
      const supply7dAgo = supply7dByKey.get(supplyKey) ?? null;
      const inventoryGrowth = supply7dAgo != null ? supply - supply7dAgo : 0;

      const lpSlug = slugFromQueryNorm(q_norm);
      const hasLp = lpSlugs.has(lpSlug);
      const ctr = ctrByQ.get(q_norm) ?? 1;
      const lowCtr = ctr < LOW_CTR_THRESHOLD;
      const highDemand = effectiveScore >= HIGH_DEMAND_MIN;

      if (supply === 0) {
        const type = "suggest_listing";
        if (!pendingSet.has(`${type}\t${q_norm}`)) {
          pendingSet.add(`${type}\t${q_norm}`);
          actions.push({
            type,
            q_norm,
            demand_score: effectiveScore,
            supply_count: 0,
            payload: { q_norm, category_slug: category_slug ?? undefined, county_slug: county_slug ?? undefined },
          });
        }
        continue;
      }
      if (highDemand && supply < 3 && !hasLp && inventoryGrowth <= 0) {
        const type = "create_lp";
        if (!pendingSet.has(`${type}\t${q_norm}`)) {
          pendingSet.add(`${type}\t${q_norm}`);
          actions.push({
            type,
            q_norm,
            demand_score: effectiveScore,
            supply_count: supply,
            payload: { q_norm, category_slug: category_slug ?? undefined, county_slug: county_slug ?? undefined },
          });
        }
        continue;
      }
      if (lowCtr && hasLp) {
        const type = "seed_links";
        if (!pendingSet.has(`${type}\t${q_norm}`)) {
          pendingSet.add(`${type}\t${q_norm}`);
          actions.push({
            type,
            q_norm,
            demand_score: effectiveScore,
            supply_count: supply,
            payload: { q_norm, lp_slug: lpSlug, category_slug: category_slug ?? undefined, county_slug: county_slug ?? undefined },
          });
        }
        continue;
      }
      if (lowCtr && !hasLp) {
        const type = "improve_lp";
        if (!pendingSet.has(`${type}\t${q_norm}`)) {
          pendingSet.add(`${type}\t${q_norm}`);
          actions.push({
            type,
            q_norm,
            demand_score: effectiveScore,
            supply_count: supply,
            payload: { q_norm, category_slug: category_slug ?? undefined, county_slug: county_slug ?? undefined },
          });
        }
      }
    }

    for (const a of actions) {
      await supabase.from("growth_demand_actions").insert({
        type: a.type,
        payload: a.payload,
        status: "pending",
        q_norm: a.q_norm,
        demand_score: a.demand_score,
        supply_count: a.supply_count,
      });
    }

    if (supplyRowsToSnapshot.length > 0) {
      await supabase.from("growth_demand_supply_snapshot").insert(
        supplyRowsToSnapshot.map((r) => ({
          q_norm: r.q_norm,
          category_slug: r.category_slug,
          county_slug: r.county_slug,
          supply: r.supply,
          snapshot_date: today,
        }))
      );
      await supabase.from("growth_demand_supply_snapshot").delete().lt("snapshot_date", pruneBefore);
    }

    await supabase.from("growth_events").insert({
      type: "demand_flywheel_refresh",
      meta: { correlationId, actionsCreated: actions.length },
    });
    return { ok: true, meta: { actionsCreated: actions.length } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({
      type: "demand_flywheel_refresh_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

const EXEC_ORDER: Array<"create_lp" | "seed_links" | "improve_lp" | "suggest_listing"> = [
  "create_lp",
  "seed_links",
  "improve_lp",
  "suggest_listing",
];
const CAP_BY_TYPE: Record<string, number> = {
  create_lp: 30,
  seed_links: 40,
  improve_lp: 20,
  suggest_listing: 10,
};
const JOB_TYPES: Record<string, string> = {
  create_lp: "pseo_generate_candidates",
  improve_lp: "seo_apply_overrides",
  seed_links: "seo_internal_links_generate",
  suggest_listing: "content_suggestions_refresh",
};

export async function handleDemandFlywheelExecute(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: pending } = await supabase
      .from("growth_demand_actions")
      .select("id, type, payload, q_norm")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(500);
    const list = (pending ?? []) as Array<{ id: string; type: string; payload: Record<string, unknown>; q_norm: string | null }>;
    const orderIdx = (t: string) => {
      const i = EXEC_ORDER.indexOf(t as (typeof EXEC_ORDER)[number]);
      return i >= 0 ? i : 999;
    };
    const sorted = [...list].sort((a, b) => orderIdx(a.type) - orderIdx(b.type));
    const capped: typeof list = [];
    const counts: Record<string, number> = { create_lp: 0, seed_links: 0, improve_lp: 0, suggest_listing: 0 };
    for (const a of sorted) {
      const cap = CAP_BY_TYPE[a.type] ?? 0;
      if (cap && (counts[a.type] ?? 0) < cap) {
        capped.push(a);
        counts[a.type] = (counts[a.type] ?? 0) + 1;
      }
    }

    const since = new Date(Date.now() - DAYS_STATS * 86400 * 1000).toISOString().slice(0, 10);
    const { data: ctrRows } = await supabase
      .from("search_intel_query_stats")
      .select("q_norm, impressions, clicks")
      .gte("day", since)
      .limit(10000);
    const ctrByQ = new Map<string, number>();
    for (const r of ctrRows ?? []) {
      const row = r as { q_norm: string; impressions: number; clicks: number };
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const ctr = imp > 0 ? clk / imp : 0;
      const cur = ctrByQ.get(row.q_norm);
      if (cur == null || imp > 0) ctrByQ.set(row.q_norm, ctr);
    }

    const byType = new Map<string, string[]>();
    for (const a of capped) {
      const ids = byType.get(a.type) ?? [];
      ids.push(a.id);
      byType.set(a.type, ids);
    }

    for (const actionType of EXEC_ORDER) {
      const actionIds = byType.get(actionType);
      if (!actionIds?.length) continue;
      const jobType = JOB_TYPES[actionType];
      if (!jobType) continue;
      await enqueueJob({ type: jobType, payload: {} }, supabase);
      for (const id of actionIds) {
        const action = capped.find((x) => x.id === id);
        const qNorm = action?.q_norm ?? null;
        const ctrBefore = qNorm != null ? (ctrByQ.get(qNorm) ?? null) : null;
        const needsCtrBefore = actionType === "create_lp" || actionType === "seed_links";
        await supabase.from("growth_demand_actions").update({ status: "executed" }).eq("id", id);
        await supabase.from("growth_demand_feedback").insert({
          action_id: id,
          type: actionType,
          payload: { enqueuedJob: jobType, correlationId },
          ...(needsCtrBefore && ctrBefore != null && { ctr_before: ctrBefore }),
        });
      }
    }

    await supabase.from("growth_events").insert({
      type: "demand_flywheel_execute",
      meta: { correlationId, executed: capped.length, byType: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.length])) },
    });
    return { ok: true, meta: { executed: capped.length } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({
      type: "demand_flywheel_execute_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function handleDemandFlywheelFeedbackEval(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const since = new Date(Date.now() - DAYS_STATS * 86400 * 1000).toISOString().slice(0, 10);

    const { data: feedbackRows } = await supabase
      .from("growth_demand_feedback")
      .select("id, action_id, type, ctr_before, payload")
      .in("type", ["create_lp", "seed_links"])
      .not("ctr_before", "is", null)
      .is("evaluated_at", null)
      .lt("created_at", sevenDaysAgo)
      .limit(200);
    const toEval = (feedbackRows ?? []) as Array<{ id: string; action_id: string | null; type: string; ctr_before: number | null; payload: Record<string, unknown> }>;
    if (toEval.length === 0) {
      await supabase.from("growth_events").insert({
        type: "demand_flywheel_feedback_eval",
        meta: { correlationId, evaluated: 0 },
      });
      return { ok: true, meta: { evaluated: 0 } };
    }

    const actionIds = [...new Set(toEval.map((f) => f.action_id).filter(Boolean))] as string[];
    const { data: actions } = await supabase
      .from("growth_demand_actions")
      .select("id, q_norm")
      .in("id", actionIds);
    const qNormByActionId = new Map<string, string>();
    for (const a of actions ?? []) {
      const row = a as { id: string; q_norm: string | null };
      if (row.q_norm) qNormByActionId.set(row.id, row.q_norm);
    }

    const { data: statsRows } = await supabase
      .from("search_intel_query_stats")
      .select("q_norm, impressions, clicks")
      .gte("day", since)
      .limit(10000);
    const ctrByQ = new Map<string, number>();
    for (const r of statsRows ?? []) {
      const row = r as { q_norm: string; impressions: number; clicks: number };
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const ctr = imp > 0 ? clk / imp : 0;
      const cur = ctrByQ.get(row.q_norm);
      if (cur == null || imp > 0) ctrByQ.set(row.q_norm, ctr);
    }

    let evaluated = 0;
    for (const f of toEval) {
      const qNorm = f.action_id ? qNormByActionId.get(f.action_id) : null;
      if (qNorm == null) continue;
      const ctrAfter = ctrByQ.get(qNorm) ?? null;
      if (ctrAfter == null) continue;
      const ctrBefore = Number(f.ctr_before) ?? 0;
      const ctrDelta = ctrAfter - ctrBefore;
      const payload = { ...(f.payload ?? {}), ctr_delta: ctrDelta, ctr_after: ctrAfter };
      const { error } = await supabase
        .from("growth_demand_feedback")
        .update({
          ctr_after: ctrAfter,
          evaluated_at: new Date().toISOString(),
          payload,
        })
        .eq("id", f.id);
      if (!error) evaluated++;
    }

    await supabase.from("growth_events").insert({
      type: "demand_flywheel_feedback_eval",
      meta: { correlationId, evaluated },
    });
    return { ok: true, meta: { evaluated } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("growth_events").insert({
      type: "demand_flywheel_feedback_eval_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
