import { createServerClient } from "@/lib/supabase/server";
import { refreshSessionSingleFlight } from "@/lib/auth/getSupabaseSessionRobust";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export type AssistantAuth = { userId: string; accessToken: string; email: string | null };

/**
 * Doar cookie + `getUser()` (prin `getRequestAuthUser`), apoi `getSession` pentru access_token
 * necesar downstream (nu ca fallback de identitate).
 */
export async function getAssistantAuth(request: Request): Promise<AssistantAuth | null> {
  const user = await getRequestAuthUser(request);
  if (!user?.id) return null;

  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let accessToken = session?.access_token ?? null;
  if (!accessToken) {
    const refreshed = await refreshSessionSingleFlight(supabase);
    accessToken = refreshed?.access_token ?? null;
  }
  if (!accessToken) return null;

  return { userId: user.id, accessToken, email: user.email ?? null };
}
