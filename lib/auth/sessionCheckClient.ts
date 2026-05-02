export type SessionCheckResult =
  | { status: "ok"; authenticated: boolean }
  | { status: "error" };

/**
 * Răspuns complet de la `/api/auth/session-check` (200 + JSON sau eroare rețea/server).
 * Folosește `fetch` direct (nu `dashboardApiFetch`) ca să evităm cicluri de import
 * client-side: `getSupabaseSessionRobust` → acest modul → `dashboardApiFetch` poate rămâne neinițializat.
 */
export async function getSessionCheckResult(): Promise<SessionCheckResult> {
  try {
    const res = await fetch("/api/auth/session-check", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      authenticated?: boolean;
    };
    if (!res.ok) return { status: "error" };
    return { status: "ok", authenticated: data.authenticated === true };
  } catch {
    return { status: "error" };
  }
}

/**
 * Întreabă serverul dacă request-ul curent (cookie / Bearer) are sesiune validă.
 * Folosește corpul JSON — endpoint-ul nu mai folosește HTTP 401 pentru „nelogat”.
 */
export async function isSessionCheckAuthenticated(): Promise<boolean> {
  const r = await getSessionCheckResult();
  return r.status === "ok" && r.authenticated;
}
