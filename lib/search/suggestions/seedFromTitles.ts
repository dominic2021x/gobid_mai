/**
 * Seed search suggestions from product titles.
 * Incremental, idempotent: cursor (last_updated_at, last_id) in agent_state.
 * Includes both live_bid (channel ro) and licitatii publice (channel executari_insolventa).
 * No AI; deterministic extractors (real estate + auto).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";
import { getSeedSuggestionsState, setSeedSuggestionsState, resetSeedSuggestionsState } from "@/lib/agents/state";
import { extractRealEstate } from "./extractors/realEstateExtractor";
import { extractAuto } from "./extractors/autoExtractor";
import { upsertSeedSuggestions, type SeedRow } from "./upsertSuggestions";
import { buildMarketplaceTaxonomy } from "@/lib/search/patterns/buildMarketplaceTaxonomy";
import { getProfileForVertical } from "@/lib/search/patterns/profiles/getProfileForVertical";
import { matchPatternProfile } from "@/lib/search/patterns/matchPatternProfile";
import { scorePatternQuality } from "@/lib/search/patterns/scorePatternQuality";

const DEFAULT_BATCH_SIZE = 500;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 1000;
const MIN_PHRASE_NORM_LENGTH = 3;
const STOPWORD_BLACKLIST = new Set(["vand", "oferta", "promo", "nou", "urgent"]);

/** Max suggestions per entity_type from seed; skip inserting new ones when at cap. */
export const SEED_ENTITY_CAP = 10_000;

function isOnlyStopwords(phraseNorm: string): boolean {
  const tokens = phraseNorm.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => STOPWORD_BLACKLIST.has(t));
}

type ProductRow = {
  id: string;
  updated_at: string;
  title: string | null;
  channel: string | null;
  requires_token: boolean | null;
};

export type SeedFromTitlesResult = {
  processed_listings: number;
  /** Raw extractions from titles (before dedupe). */
  extracted_candidates: number;
  /** Unique (phrase_norm + entity_type) rows sent to RPC after client dedupe. */
  unique_phrases_sent_to_db: number;
  /** Rows merged by dedupe among rows sent to RPC (same phrase_norm+entity in batch). */
  deduplicated_in_batch: number;
  /** Candidates not sent because entity_type hit SEED_ENTITY_CAP. */
  candidates_dropped_cap?: number;
  /** RPC processed one row per unique phrase (insert or update). Same as unique_phrases_sent_to_db when RPC succeeds. */
  distinct_upserted: number;
  /** @deprecated Use deduplicated_in_batch */
  duplicates_skipped: number;
  last_updated_at: string | null;
  last_id: string | null;
  elapsed_ms: number;
  reason?: string;
  /** Total search_suggestions rows: kind=query, is_public, is_active (all sources). */
  total_suggestions_in_db?: number;
  /** Total rows source=seed_titles only (sum of entity_type buckets below). */
  total_suggestions_after_seed?: number;
  /** Per entity_type for source=seed_titles only. */
  entity_type_distribution?: Record<string, number>;
  /** Titlu + sugestii generate per listing (batch curent). */
  product_suggestion_log?: ProductSuggestionLogEntry[];
};

/** O intrare în jurnalul titlu → sugestii (seed from titles). */
export type ProductSuggestionLogEntry = {
  listing_id: string;
  title: string;
  suggestions: Array<{ phrase: string; entity_type: string }>;
};

export type SeedFromTitlesOptions = {
  /** Number of products per batch (1–1000). Default 500. */
  batchSize?: number;
  /** When set, overrides default incremental cursor behavior. */
  mode?: "single" | "recent" | "full" | "next";
  /** For mode "single": product id to re-seed. */
  listingId?: string;
  /** For mode "recent": max products to process (default batchSize). */
  limit?: number;
  /** When true (default), fetch products with needs_reindex first before cursor batch. */
  prioritizeNeedsReindex?: boolean;
  /** Include product_suggestion_log (titlu + sugestii per listing). Default true. Cron poate seta false. */
  includeProductSuggestionLog?: boolean;
};

/**
 * Fetch next batch of products via RPC (cursor: updated_at + id).
 */
async function fetchProductsBatch(
  supabase: ReturnType<typeof createAdminClient>,
  last_updated_at: string,
  last_id: string,
  limit: number
): Promise<ProductRow[]> {
  const { data, error } = await supabase.rpc("seed_products_batch", {
    p_last_updated_at: last_updated_at,
    p_last_id: last_id,
    p_lim: Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, limit)),
  });
  if (error) throw error;
  const rows = (data ?? []) as ProductRow[];
  return rows.map((r) => ({
    id: String(r.id),
    updated_at: r.updated_at ?? "",
    title: r.title ?? null,
    channel: r.channel ?? null,
    requires_token: r.requires_token ?? false,
  }));
}

/** Fetch one product by id (for mode "single"). Same status/channel filters as RPC. */
async function fetchProductById(
  supabase: ReturnType<typeof createAdminClient>,
  id: string
): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, updated_at, title, channel, requires_token")
    .eq("id", id)
    .in("status", ["active", "reserved", "sold", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const r = data as { id: string; updated_at: string | null; title: string | null; channel: string | null; requires_token: boolean | null } | null;
  if (!r) return [];
  return [{
    id: String(r.id),
    updated_at: r.updated_at ?? "",
    title: r.title ?? null,
    channel: r.channel ?? null,
    requires_token: r.requires_token ?? false,
  }];
}

/** Fetch most recently updated products (for mode "recent"). */
async function fetchProductsRecent(
  supabase: ReturnType<typeof createAdminClient>,
  limit: number
): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, updated_at, title, channel, requires_token")
    .in("status", ["active", "reserved", "sold", "in_progress"])
    .or("channel.is.null,channel.eq.ro,channel.eq.executari_insolventa")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, limit)));
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; updated_at: string | null; title: string | null; channel: string | null; requires_token: boolean | null }>;
  return rows.map((r) => ({
    id: String(r.id),
    updated_at: r.updated_at ?? "",
    title: r.title ?? null,
    channel: r.channel ?? null,
    requires_token: r.requires_token ?? false,
  }));
}

/** Fetch products with needs_reindex = true (prioritized batch). */
async function fetchProductsNeedsReindex(
  supabase: ReturnType<typeof createAdminClient>,
  limit: number
): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, updated_at, title, channel, requires_token")
    .eq("needs_reindex", true)
    .in("status", ["active", "reserved", "sold", "in_progress"])
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, limit)));
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; updated_at: string | null; title: string | null; channel: string | null; requires_token: boolean | null }>;
  return rows.map((r) => ({
    id: String(r.id),
    updated_at: r.updated_at ?? "",
    title: r.title ?? null,
    channel: r.channel ?? null,
    requires_token: r.requires_token ?? false,
  }));
}

/**
 * Extract candidates from title. All products in batch (ro + executari_insolventa) contribute to suggestions.
 */
function extractCandidates(product: ProductRow): SeedRow[] {
  const title = product.title ?? "";
  const rows: SeedRow[] = [];

  for (const c of extractRealEstate(title)) {
    rows.push({
      phrase: c.label,
      phrase_norm: "",
      entity_type: c.entity_type,
      is_public: true,
    });
  }
  for (const c of extractAuto(title)) {
    rows.push({
      phrase: c.label,
      phrase_norm: "",
      entity_type: c.entity_type,
      is_public: true,
    });
  }

  return rows;
}

function buildProductSuggestionLog(products: ProductRow[]): ProductSuggestionLogEntry[] {
  return products.map((row) => {
    const candidates = extractCandidates(row);
    const byKey = new Map<string, { phrase: string; entity_type: string }>();
    for (const c of candidates) {
      const phrase_norm = normalizeRo(c.phrase.trim());
      if (phrase_norm.length < MIN_PHRASE_NORM_LENGTH) continue;
      if (isOnlyStopwords(phrase_norm)) continue;
      const et = (c.entity_type ?? "").trim() || "general";
      const key = `${phrase_norm}|${et}`;
      if (!byKey.has(key)) {
        byKey.set(key, { phrase: c.phrase.trim(), entity_type: et });
      }
    }
    return {
      listing_id: row.id,
      title: (row.title ?? "").slice(0, 500),
      suggestions: Array.from(byKey.values()),
    };
  });
}

/** Entity types used by seed extractors; cap is checked for each. */
const SEED_ENTITY_TYPES = ["", "real_estate", "auto"] as const;

/**
 * Count suggestions per entity_type (source = seed_titles). Used for per-entity cap.
 */
async function getSeedCountsByEntityType(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const et of SEED_ENTITY_TYPES) {
    const q = supabase
      .from("search_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("source", "seed_titles")
      .eq("entity_type", et);
    const { count, error } = await q;
    if (!error && typeof count === "number") counts.set(et, count);
  }
  return counts;
}

/** Total public active query suggestions (all sources: seed, track, bootstrap, etc.). */
async function getTotalPublicQuerySuggestions(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { count, error } = await supabase
    .from("search_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("kind", "query")
    .eq("is_public", true)
    .eq("is_active", true);
  if (error || count == null) return 0;
  return count;
}

async function finalizeResult(
  supabase: ReturnType<typeof createAdminClient>,
  afterCounts: Map<string, number>,
  start: number,
  fields: Omit<
    SeedFromTitlesResult,
    | "total_suggestions_in_db"
    | "total_suggestions_after_seed"
    | "entity_type_distribution"
    | "elapsed_ms"
  > &
    Partial<
      Pick<SeedFromTitlesResult, "reason" | "product_suggestion_log" | "candidates_dropped_cap">
    >
): Promise<SeedFromTitlesResult> {
  const totalSeed = [...afterCounts.values()].reduce((a, b) => a + b, 0);
  const distribution: Record<string, number> = {};
  afterCounts.forEach((count, et) => {
    distribution[et === "" ? "_empty" : et] = count;
  });
  const totalInDb = await getTotalPublicQuerySuggestions(supabase);
  return {
    ...fields,
    elapsed_ms: Date.now() - start,
    total_suggestions_in_db: totalInDb,
    total_suggestions_after_seed: totalSeed,
    entity_type_distribution: distribution,
  };
}

/**
 * Run one batch: load state, fetch products, extract, upsert, update state.
 */
export async function runSeedFromTitlesBatch(
  supabase: ReturnType<typeof createAdminClient>,
  options?: SeedFromTitlesOptions
): Promise<SeedFromTitlesResult> {
  const batchSize =
    options?.batchSize != null
      ? Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, options.batchSize))
      : DEFAULT_BATCH_SIZE;
  const mode = options?.mode;
  const listingId = options?.listingId;
  const limit = options?.limit ?? batchSize;
  const prioritizeNeedsReindex = options?.prioritizeNeedsReindex !== false;
  const includeLog = options?.includeProductSuggestionLog !== false;

  const start = Date.now();
  let state = await getSeedSuggestionsState(supabase);
  let products: ProductRow[] = [];
  let updateCursor = false;

  if (mode === "full") {
    await resetSeedSuggestionsState(supabase);
    state = await getSeedSuggestionsState(supabase);
    products = await fetchProductsBatch(supabase, state.last_updated_at, state.last_id, batchSize);
    updateCursor = true;
  } else if (mode === "next") {
    products = await fetchProductsBatch(supabase, state.last_updated_at, state.last_id, batchSize);
    updateCursor = true;
  } else if (mode === "single" && listingId) {
    products = await fetchProductById(supabase, listingId);
  } else if (mode === "recent") {
    products = await fetchProductsRecent(supabase, limit);
  } else if (prioritizeNeedsReindex) {
    products = await fetchProductsNeedsReindex(supabase, batchSize);
    if (products.length > 0) updateCursor = false;
    else {
      products = await fetchProductsBatch(supabase, state.last_updated_at, state.last_id, batchSize);
      updateCursor = true;
    }
  } else {
    products = await fetchProductsBatch(supabase, state.last_updated_at, state.last_id, batchSize);
    updateCursor = true;
  }

  if (products.length === 0) {
    const afterCounts = await getSeedCountsByEntityType(supabase);
    return finalizeResult(supabase, afterCounts, start, {
      processed_listings: 0,
      extracted_candidates: 0,
      unique_phrases_sent_to_db: 0,
      deduplicated_in_batch: 0,
      distinct_upserted: 0,
      duplicates_skipped: 0,
      last_updated_at: state.last_updated_at,
      last_id: state.last_id,
      ...(includeLog ? { product_suggestion_log: [] } : {}),
    });
  }

  const productSuggestionLog = includeLog ? buildProductSuggestionLog(products) : undefined;

  const lastRow = products[products.length - 1];
  const next_updated_at =
    lastRow.updated_at && lastRow.updated_at.length > 0
      ? lastRow.updated_at
      : "1970-01-01T00:00:00Z";
  const next_id = lastRow.id;

  const allRows: SeedRow[] = [];
  for (const row of products) {
    const candidates = extractCandidates(row);
    for (const c of candidates) {
      const phrase_norm = normalizeRo(c.phrase.trim());
      if (phrase_norm.length < MIN_PHRASE_NORM_LENGTH) continue;
      if (isOnlyStopwords(phrase_norm)) continue;
      allRows.push({ ...c, phrase_norm });
    }
  }

  const taxonomy = buildMarketplaceTaxonomy();
  const categoryFromEntity = (et: string | undefined): string | null => {
    if (et === "real_estate") return "imobiliare";
    if (et === "auto") return "autovehicule";
    return null;
  };
  const patternFilteredRows = allRows.filter((row) => {
    const profile = getProfileForVertical(categoryFromEntity(row.entity_type ?? undefined));
    const match = matchPatternProfile(row.phrase_norm, { taxonomy, profile });
    if (match.invalid) return false;
    const score = scorePatternQuality(match, profile);
    return score >= profile.minPatternScore;
  });

  const countsByEntity = await getSeedCountsByEntityType(supabase);
  const cappedEntityTypes = new Set(
    [...countsByEntity.entries()]
      .filter(([, count]) => count >= SEED_ENTITY_CAP)
      .map(([et]) => et)
  );
  const rowsToUpsert =
    cappedEntityTypes.size === 0
      ? patternFilteredRows
      : patternFilteredRows.filter((r) => !cappedEntityTypes.has(r.entity_type ?? ""));

  const allCapped = SEED_ENTITY_TYPES.every((et) => cappedEntityTypes.has(et));
  if (allCapped && rowsToUpsert.length === 0) {
    if (updateCursor) {
      await setSeedSuggestionsState(supabase, { last_updated_at: next_updated_at, last_id: next_id });
    }
    await clearNeedsReindex(supabase, products.map((p) => p.id));
    const afterCounts = await getSeedCountsByEntityType(supabase);
    return finalizeResult(supabase, afterCounts, start, {
      processed_listings: products.length,
      extracted_candidates: patternFilteredRows.length,
      unique_phrases_sent_to_db: 0,
      deduplicated_in_batch: 0,
      distinct_upserted: 0,
      duplicates_skipped: 0,
      last_updated_at: next_updated_at,
      last_id: next_id,
      reason: "all entity types capped",
      ...(productSuggestionLog ? { product_suggestion_log: productSuggestionLog } : {}),
    });
  }

  const { upserted, distinctSent } = await upsertSeedSuggestions(
    supabase,
    rowsToUpsert,
    next_id
  );
  if (updateCursor) {
    await setSeedSuggestionsState(supabase, { last_updated_at: next_updated_at, last_id: next_id });
  }
  await clearNeedsReindex(supabase, products.map((p) => p.id));

  const afterCounts = await getSeedCountsByEntityType(supabase);
  const capDrop = Math.max(0, patternFilteredRows.length - rowsToUpsert.length);
  const deduped = Math.max(0, rowsToUpsert.length - distinctSent);

  return finalizeResult(supabase, afterCounts, start, {
    processed_listings: products.length,
    extracted_candidates: patternFilteredRows.length,
    unique_phrases_sent_to_db: distinctSent,
    deduplicated_in_batch: deduped,
    distinct_upserted: upserted,
    duplicates_skipped: deduped,
    last_updated_at: next_updated_at,
    last_id: next_id,
    ...(capDrop > 0 ? { candidates_dropped_cap: capDrop } : {}),
    ...(productSuggestionLog ? { product_suggestion_log: productSuggestionLog } : {}),
  });
}

async function clearNeedsReindex(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    await supabase.from("products").update({ needs_reindex: false }).in("id", batch);
  }
}
