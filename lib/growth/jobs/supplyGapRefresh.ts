import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import { fetchQueryStatsMap } from "@/lib/alerts/ranking/fetchRankingData";
import { scoreGap } from "@/lib/growth/supply-gaps/quality";

const TOP_QUERIES_LIMIT = 200;
const BATCH_CONCURRENCY = 20;

interface DemandRow {
  q_norm: string;
  demand: number;
}

/**
 * Run supply gap refresh: fetch top queries by demand, compute supply, gap_score,
 * quality_score, flags, upsert top 200.
 */
export async function runSupplyGapRefresh(supabase?: SupabaseClient): Promise<{
  ok: boolean;
  processed: number;
  error?: string;
}> {
  const db = supabase ?? createAdminClient();
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

  try {
    let demands: DemandRow[];
    const { data: raw } = await db
        .from("search_intel_query_stats")
        .select("q_norm, impressions")
        .gte("day", since);

    if (raw && Array.isArray(raw)) {
        const byQ = new Map<string, number>();
        for (const r of raw) {
          const row = r as { q_norm: string; impressions: number };
          const q = String(row.q_norm ?? "").trim();
          if (!q) continue;
          byQ.set(q, (byQ.get(q) ?? 0) + Number(row.impressions ?? 0));
        }
        demands = [...byQ.entries()]
          .map(([q_norm, demand]) => ({ q_norm, demand }))
          .sort((a, b) => b.demand - a.demand)
          .slice(0, TOP_QUERIES_LIMIT);
    } else {
      demands = [];
    }

    if (demands.length === 0) {
      return { ok: true, processed: 0 };
    }

    async function supplyFor(qNorm: string): Promise<number> {
      try {
        return await countProducts(
          { q: qNorm, scope: "all", channel: "ro" } as Parameters<typeof countProducts>[0],
          undefined
        );
      } catch {
        return 0;
      }
    }

    const chunks: DemandRow[][] = [];
    for (let i = 0; i < demands.length; i += BATCH_CONCURRENCY) {
      chunks.push(demands.slice(i, i + BATCH_CONCURRENCY));
    }

    const gaps: Array<{ q_norm: string; category_slug: string | null; county_slug: string | null; search_demand: number; listing_supply: number; gap_score: number }> = [];

    for (const chunk of chunks) {
      const supplies = await Promise.all(chunk.map((d) => supplyFor(d.q_norm)));
      for (let i = 0; i < chunk.length; i++) {
        const d = chunk[i]!;
        const supply = supplies[i] ?? 0;
        const gapScore = d.demand / Math.max(1, supply);
        gaps.push({
          q_norm: d.q_norm,
          category_slug: null,
          county_slug: null,
          search_demand: d.demand,
          listing_supply: supply,
          gap_score: gapScore,
        });
      }
    }

    gaps.sort((a, b) => b.gap_score - a.gap_score);
    const topGaps = gaps.slice(0, TOP_QUERIES_LIMIT);

    const qNorms = topGaps.map((g) => g.q_norm);
    const queryStatsMap = await fetchQueryStatsMap(db, qNorms);

    const rows = topGaps.map((g) => {
      const stats = queryStatsMap.get(g.q_norm);
      const { quality_score, flags } = scoreGap(g, stats ? { ctr_7d: stats.ctr_7d, pogo_rate: stats.pogo_rate } : null);
      return {
        q_norm: g.q_norm,
        category_slug: g.category_slug,
        county_slug: g.county_slug,
        search_demand: g.search_demand,
        listing_supply: g.listing_supply,
        gap_score: g.gap_score,
        quality_score,
        flags,
        action_state: "new",
        status: "new",
      };
    });

    await db.from("market_supply_gaps").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (rows.length > 0) {
      await db.from("market_supply_gaps").insert(rows);
    }

    return { ok: true, processed: rows.length };
  } catch (err) {
    return { ok: false, processed: 0, error: (err as Error).message };
  }
}
