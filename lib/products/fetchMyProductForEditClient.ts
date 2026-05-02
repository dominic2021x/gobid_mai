import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverDashboardSessionIfNeeded } from "@/lib/auth/dashboardSessionRecovery";
import { getSupabaseAccessTokenRobust } from "@/lib/auth/getSupabaseSessionRobust";

async function getOnce(
  supabase: SupabaseClient,
  productId: string
): Promise<Response> {
  await getSupabaseAccessTokenRobust(supabase);
  const path = `/api/products/my/${encodeURIComponent(productId)}`;
  return fetch(path, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: new Headers({ Accept: "application/json" }),
  });
}

/**
 * Încarcă produsul pentru formularul „Editează” prin API (cookie + token în header/query — ca update-status).
 */
export async function fetchMyProductRowForEdit(
  supabase: SupabaseClient,
  productId: string
): Promise<
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; httpStatus: number; message: string }
> {
  await recoverDashboardSessionIfNeeded(supabase);

  let res = await getOnce(supabase, productId);
  /** O singură reîncercare după 401 — aliniat cu `updateMyProductStatusClient`. */
  if (res.status === 401) {
    await recoverDashboardSessionIfNeeded(supabase);
    res = await getOnce(supabase, productId);
  }

  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    product?: Record<string, unknown>;
  };

  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      message:
        typeof j.error === "string"
          ? j.error
          : res.status === 401
            ? "Trebuie să fii autentificat."
            : "Nu s-a putut încărca produsul.",
    };
  }

  const row = j.product;
  if (!row || typeof row !== "object") {
    return { ok: false, httpStatus: 500, message: "Răspuns invalid de la server." };
  }

  return { ok: true, row };
}
