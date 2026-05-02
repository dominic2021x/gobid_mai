import { supabaseAdmin } from "@/lib/supabase";
import { getRoExecutariCrosslistEnabled } from "@/lib/ro-crosslist-settings";
import { buildEnterpriseRpcArgs, type ProductQuery } from "@/lib/server/products/listingsRepo";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";

/**
 * Thin wrapper around `search_ro_listings_enterprise` for `/api/search/results` (Phase 5).
 */
export async function fetchEnterpriseSearchRows(opts: {
  q: string;
  categoryKey: string;
  subcategoryKey: string;
  location: string;
  offset: number;
  limit: number;
}): Promise<Record<string, unknown>[]> {
  if (!supabaseAdmin) return [];
  const admin = supabaseAdmin;

  const includeExecutari = await getRoExecutariCrosslistEnabled(true);
  const query: ProductQuery = {
    q: opts.q.trim() || undefined,
    categorie: opts.categoryKey && opts.categoryKey !== "all" ? opts.categoryKey : undefined,
    subcategorie: opts.subcategoryKey && opts.subcategoryKey !== "all" ? opts.subcategoryKey : undefined,
    location: opts.location && opts.location !== "all" ? opts.location : undefined,
    from: opts.offset,
    limit: opts.limit,
    pageSize: opts.limit,
    channel: "ro",
    scope: "all",
    sort: "newest",
  };

  const args = buildEnterpriseRpcArgs(query, undefined, includeExecutari, opts.limit);

  const { data, error } = await runPostgrestQuery<Record<string, unknown>[]>(
    (signal) => admin.rpc("search_ro_listings_enterprise", args).abortSignal(signal),
    { timeoutMs: 8500, maxRetries: 0, retryDelayMs: 250 },
  );

  if (error || !Array.isArray(data)) return [];
  return data;
}
