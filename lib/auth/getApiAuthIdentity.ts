import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export type ApiAuthIdentity = { userId: string; email: string | null };

/**
 * Identitate din `getRequestAuthUser` — doar cookie + `getUser()`.
 */
export async function getApiAuthIdentity(request: Request): Promise<ApiAuthIdentity | null> {
  const user = await getRequestAuthUser(request);
  if (!user?.id) return null;
  return { userId: user.id, email: user.email ?? null };
}
