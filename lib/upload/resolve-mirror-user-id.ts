/**
 * Preferă `user_id` de pe produs; altfel `R2_SYSTEM_IMPORT_USER_ID` (importuri admin / ANAF / REPES).
 */
export function resolveMirrorUserId(preferredUserId?: string | null): string | null {
  const p = typeof preferredUserId === "string" ? preferredUserId.trim() : "";
  if (p) return p;
  const sys = process.env.R2_SYSTEM_IMPORT_USER_ID?.trim();
  return sys || null;
}
