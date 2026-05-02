import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTH_CLIENT_CALL_TIMEOUT_MS,
  getSupabaseSessionRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { isSessionCheckAuthenticated } from "@/lib/auth/sessionCheckClient";

/**
 * One shared recovery flight for the whole app: session-check + refreshSession.
 * Parallel callers (Strict Mode, fast remounts) await the same promise — no duplicate refreshes.
 */
let recoveryPromise: Promise<void> | null = null;

/**
 * If the in-memory client has no session, verify cookies via /api/auth/session-check and refresh once.
 */
export async function recoverDashboardSessionIfNeeded(
  supabase: SupabaseClient,
): Promise<Awaited<ReturnType<typeof getSupabaseSessionRobust>>> {
  let session = await getSupabaseSessionRobust(supabase, AUTH_CLIENT_CALL_TIMEOUT_MS);
  if (session?.user) return session;

  if (!recoveryPromise) {
    recoveryPromise = (async () => {
      if (await isSessionCheckAuthenticated()) {
        await refreshSessionSingleFlight(supabase, AUTH_CLIENT_CALL_TIMEOUT_MS);
      }
    })().finally(() => {
      recoveryPromise = null;
    });
  }

  await recoveryPromise;
  return getSupabaseSessionRobust(supabase, AUTH_CLIENT_CALL_TIMEOUT_MS);
}
