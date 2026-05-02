import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverDashboardSessionIfNeeded } from "@/lib/auth/dashboardSessionRecovery";
import {
  getSupabaseAccessTokenRobust,
  isAuthRefreshBackoffActive,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { getSessionCheckResult } from "@/lib/auth/sessionCheckClient";

export type MyProductStatus = "inactive" | "active" | "reserved" | "sold";

/** O singură actualizare la un moment dat — evită 4× POST paralele → 4× 401 când Supabase e în 429. */
let updateStatusChain: Promise<void> = Promise.resolve();

function enqueueUpdateStatus<T>(fn: () => Promise<T>): Promise<T> {
  const p = updateStatusChain.then(() => fn());
  updateStatusChain = p.then(() => undefined).catch(() => undefined);
  return p;
}

function updateStatusApiUrl(): string {
  if (typeof window !== "undefined") {
    return new URL("/api/products/my/update-status", window.location.origin).href;
  }
  return "/api/products/my/update-status";
}

/**
 * Token pentru API: `getSupabaseAccessTokenRobust` poate returna null (ex. backoff 429) chiar dacă
 * `getSession()` încă are `access_token` în memorie — îl luăm explicit.
 */
async function resolveAccessTokenForApi(supabase: SupabaseClient): Promise<string | null> {
  let t = await getSupabaseAccessTokenRobust(supabase);
  if (t) return t;

  const { data: s1 } = await supabase.auth.getSession();
  if (s1.session?.access_token) return s1.session.access_token;

  const check = await getSessionCheckResult();
  if (check.status === "ok" && check.authenticated) {
    const rs = await refreshSessionSingleFlight(supabase);
    if (rs?.access_token) return rs.access_token;
  }

  const { data: s3 } = await supabase.auth.getSession();
  return s3.session?.access_token ?? null;
}

/**
 * `fetch` cu origin-ul paginii curente + cookie-uri + JWT în header și corp (ca backup dacă headerul e filtrat).
 */
async function postUpdateStatus(
  supabase: SupabaseClient,
  productId: string,
  status: MyProductStatus
): Promise<Response> {
  await resolveAccessTokenForApi(supabase);

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  return fetch(updateStatusApiUrl(), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers,
    body: JSON.stringify({ productId, status }),
  });
}

export async function updateMyProductStatus(
  supabase: SupabaseClient,
  productId: string,
  status: MyProductStatus
): Promise<{ ok: true } | { ok: false; message: string; httpStatus: number }> {
  return enqueueUpdateStatus(async () => {
    await recoverDashboardSessionIfNeeded(supabase);

    let res = await postUpdateStatus(supabase, productId, status);
    /** O singură reîncercare după 401 — evită bucle de refresh + 429. */
    if (res.status === 401 && !isAuthRefreshBackoffActive()) {
      await recoverDashboardSessionIfNeeded(supabase);
      res = await postUpdateStatus(supabase, productId, status);
    }

    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const rateLimited =
        res.status === 401 && isAuthRefreshBackoffActive();
      return {
        ok: false,
        message: rateLimited
          ? "Autentificarea este temporar limitată (prea multe reîncercări către Supabase). Așteaptă 1–2 minute și încearcă din nou."
          : typeof j.error === "string"
            ? j.error
            : "Eroare la actualizare.",
        httpStatus: res.status,
      };
    }
    return { ok: true };
  });
}
