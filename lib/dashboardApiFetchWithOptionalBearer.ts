/**
 * @deprecated Numele istoric — nu mai atașează Bearer. Apeluri dashboard către `/api/*` cu
 * `credentials: "include"` (cookie Supabase SSR). Folosește `dashboardApiFetch` direct.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { getSupabaseAccessTokenRobust } from "@/lib/auth/getSupabaseSessionRobust";

export async function dashboardApiFetchWithOptionalBearer(
  supabase: SupabaseClient,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  await getSupabaseAccessTokenRobust(supabase);
  return dashboardApiFetch(input, init);
}
