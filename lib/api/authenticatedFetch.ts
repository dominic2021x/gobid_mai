/**
 * Same-origin authenticated API calls: no cached auth responses, cookies included.
 * Use for dashboard / session-sensitive GET and mutations after navigation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshSessionSingleFlight } from "@/lib/auth/getSupabaseSessionRobust";

export type AuthenticatedFetchInit = RequestInit & {
  /** @default true */
  auth?: boolean;
};

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: AuthenticatedFetchInit = {}
): Promise<Response> {
  const { auth: _auth = true, ...rest } = init;
  return fetch(input, {
    ...rest,
    /** `include` sends cookies on same-site and cross-site (use for API on subdomains / Vercel). */
    credentials: rest.credentials ?? "include",
    cache: rest.cache ?? "no-store",
  });
}

/** One silent refresh then retry — use from client code when 401 happens after token rotation. */
export async function authenticatedFetchWithSessionRetry(
  supabase: SupabaseClient,
  input: RequestInfo | URL,
  init: AuthenticatedFetchInit = {}
): Promise<Response> {
  let res = await authenticatedFetch(input, init);
  if (res.status !== 401) return res;
  await refreshSessionSingleFlight(supabase);
  return authenticatedFetch(input, init);
}
