/**
 * Filtre „Tip vânzător”: Particular vs Companie, aliniat la înregistrare + dealer piese (metadata).
 * Rezolvare prin Supabase (fără Prisma) — același set de `user_id` ca logica anterioară.
 */

import { supabaseAdmin } from "@/lib/supabase";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";

export type SellerKindParam = "particular" | "companie";

/** Profil → tip efectiv afișat / filtrat (inclusiv piese_auto + piese_auto_sell_as_company). */
export function effectiveSellerKindFromProfile(row: {
  account_type?: string | null;
  metadata?: unknown;
}): SellerKindParam {
  const t = String(row.account_type ?? "private").toLowerCase();
  if (t === "piese_auto") {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const sellAsCo =
      meta.piese_auto_sell_as_company === true || String(meta.piese_auto_sell_as_company) === "true";
    return sellAsCo ? "companie" : "particular";
  }
  if (t === "company" || t === "business" || t === "executor" || t === "liquidator") {
    return "companie";
  }
  return "particular";
}

async function fetchCompanieSellerUserIds(): Promise<string[]> {
  if (!supabaseAdmin) {
    throw new Error(
      "[resolveSellerUserIdsForQuery] SUPABASE_SERVICE_ROLE_KEY is required for seller kind (particular/companie) filters.",
    );
  }

  const { data: directRows, error: e1 } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id")
    .eq("is_deleted", false)
    .or(
      "account_type.ilike.company,account_type.ilike.business,account_type.ilike.executor,account_type.ilike.liquidator",
    );

  const { data: pieseRows, error: e2 } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, metadata")
    .eq("is_deleted", false)
    .ilike("account_type", "piese_auto");

  if (e1) throw e1;
  if (e2) throw e2;

  const ids = new Set<string>();
  for (const row of directRows ?? []) {
    const id = row.user_id as string | undefined;
    if (id) ids.add(id);
  }
  for (const row of pieseRows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const sellAsCo =
      meta.piese_auto_sell_as_company === true || String(meta.piese_auto_sell_as_company) === "true";
    if (sellAsCo) {
      const id = row.user_id as string | undefined;
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Un singur tip selectat → construiește filtru pe `user_id` la produse.
 *
 * - **companie**: `user_id IN (ids profiluri „companie”)`.
 * - **particular**: `user_id NOT IN (aceiași ids)` **sau** `user_id` null — astfel intră și vânzătorii
 *   fără rând în `user_profiles`, sau cu `account_type` neclasificat (tot ce nu e explicit companie
 *   e tratat ca particular, aliniat la `effectiveSellerKindFromProfile`).
 *
 * Dacă nu există niciun vânzător „companie” în DB, particular nu restricționează după `user_id`.
 */
export async function resolveSellerUserIdsForQuery(query: ProductQuery): Promise<ProductQuery> {
  const raw = query.sellerKinds ?? [];
  const kinds = Array.from(
    new Set(
      raw
        .map((k) => String(k).toLowerCase().trim())
        .filter((k): k is SellerKindParam => k === "particular" || k === "companie"),
    ),
  );

  if (kinds.length !== 1) {
    const { sellerKinds: _sk, seller_user_ids: _su, seller_user_ids_exclude: _ex, ...rest } = query;
    return {
      ...rest,
      sellerKinds: kinds.length ? kinds : undefined,
      seller_user_ids: undefined,
      seller_user_ids_exclude: undefined,
    };
  }

  const kind = kinds[0];

  const companieIds = await fetchCompanieSellerUserIds();

  if (kind === "companie") {
    return {
      ...query,
      sellerKinds: kinds,
      seller_user_ids: companieIds,
      seller_user_ids_exclude: undefined,
    };
  }

  // particular
  if (companieIds.length === 0) {
    const { seller_user_ids: _su, seller_user_ids_exclude: _ex, ...rest } = query;
    return {
      ...rest,
      sellerKinds: kinds,
      seller_user_ids: undefined,
      seller_user_ids_exclude: undefined,
    };
  }

  return {
    ...query,
    sellerKinds: kinds,
    seller_user_ids: companieIds,
    seller_user_ids_exclude: true,
  };
}
