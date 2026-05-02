import type { User } from "@supabase/supabase-js";

import { getUserFromJwt, getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

/**
 * Prefer Supabase session from cookies (dashboard), then `Authorization: Bearer` for scripts/clients
 * that send a JWT explicitly.
 */
export async function resolveAuthenticatedApiUser(request: Request): Promise<User | null> {
  const fromCookie = await getRequestAuthUser(request);
  if (fromCookie) return fromCookie;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      return getUserFromJwt(token);
    }
  }

  return null;
}
