/**
 * Rerank: weights from getWeightsForBucket (or default). Freshness = exp(-ageDays / 30).
 * Applies queryBoostMultiplier to final score when present.
 */

import type { SearchCandidate } from "./types";
import type { RerankWeights } from "./weights";

const FRESHNESS_HALFLIFE_DAYS = 30;

function freshnessScore(item: Record<string, unknown>): number {
  const created = (item as { created_at?: string }).created_at;
  if (!created) return 0.5;
  const ageDays = (Date.now() - new Date(created).getTime()) / (86400 * 1000);
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / FRESHNESS_HALFLIFE_DAYS);
}

export function rerank(
  candidates: SearchCandidate[],
  weights?: RerankWeights | null
): SearchCandidate[] {
  const hasSem = candidates.some((c) => c.semScore != null && c.semScore > 0);
  const w = weights ?? (hasSem ? { w_lex: 0.45, w_sem: 0.35, w_graph: 0.15, w_fresh: 0.05 } : { w_lex: 0.6, w_sem: 0, w_graph: 0.25, w_fresh: 0.15 });
  return candidates
    .map((c) => {
      const lex = c.lexScore ?? 0;
      const sem = c.semScore ?? 0;
      const graph = c.graphScore ?? 0;
      const fresh = c.freshnessScore ?? freshnessScore(c.item);
      let score = w.w_lex * lex + w.w_sem * sem + w.w_graph * graph + w.w_fresh * fresh;
      const mult = c.queryBoostMultiplier ?? 1;
      if (Number.isFinite(mult)) score *= mult;
      return { ...c, freshnessScore: fresh, score };
    })
    .sort((a, b) => b.score - a.score);
}
