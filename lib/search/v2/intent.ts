/**
 * Intent detection: rules first, then graph_queries, then deterministic tokens.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntentResult } from "./types";

const DEFAULT_INTENT = "search";

function tokenMatch(pattern: string, qNorm: string): boolean {
  const pat = pattern.trim().toLowerCase();
  if (pat.startsWith("*") && pat.endsWith("*")) {
    const inner = pat.slice(1, -1);
    return inner.length > 0 && qNorm.includes(inner);
  }
  if (pat.endsWith("*")) {
    const prefix = pat.slice(0, -1);
    return prefix.length > 0 && qNorm.startsWith(prefix);
  }
  const tokens = new Set(qNorm.split(/\s+/).filter(Boolean));
  return tokens.has(pat) || qNorm === pat;
}

export async function detectIntent(
  supabase: SupabaseClient,
  qNorm: string
): Promise<IntentResult> {
  const forcedFilters: Record<string, unknown> = {};
  let intent = DEFAULT_INTENT;
  let categorySlug: string | null = null;
  let countySlug: string | null = null;

  const { data: rules } = await supabase
    .from("search_intent_rules")
    .select("pattern, intent, forced_filters")
    .order("priority", { ascending: false });

  for (const row of rules ?? []) {
    const r = row as { pattern: string; intent: string; forced_filters?: Record<string, unknown> };
    if (tokenMatch(r.pattern, qNorm)) {
      intent = r.intent;
      if (r.forced_filters && typeof r.forced_filters === "object") {
        Object.assign(forcedFilters, r.forced_filters);
      }
      if (forcedFilters.categorie) categorySlug = String(forcedFilters.categorie);
      if (forcedFilters.county) countySlug = String(forcedFilters.county);
      return { intent, forcedFilters, categorySlug, countySlug };
    }
  }

  const { data: gq } = await supabase
    .from("graph_queries")
    .select("best_node_id, intent, county_slug, category_slug")
    .eq("q_norm", qNorm)
    .maybeSingle();

  if (gq) {
    const g = gq as { intent?: string; county_slug?: string | null; category_slug?: string | null };
    if (g.intent) intent = g.intent;
    if (g.category_slug) {
      categorySlug = g.category_slug;
      forcedFilters.categorie = categorySlug;
    }
    if (g.county_slug) {
      countySlug = g.county_slug;
      forcedFilters.county = countySlug;
    }
    return { intent, forcedFilters, categorySlug, countySlug };
  }

  const tokens = qNorm.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) intent = "navigational";
  return { intent, forcedFilters, categorySlug, countySlug };
}
