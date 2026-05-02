import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Timeout pentru operații care pot agăța (ex. refresh pe rețea lentă).
 * Prima citire a sesiunii NU folosește race cu timeout — vezi `getSessionDirect`.
 */
export const AUTH_CLIENT_CALL_TIMEOUT_MS = 10_000;

/** Refresh la token poate dura mai mult pe mobil / rețea slabă. */
const AUTH_REFRESH_OPERATION_TIMEOUT_MS = 15_000;

/** După 429 de la `/auth/v1/token` — Supabase limitează strict; fereastră lungă ca să nu amplificăm 429. */
const AUTH_REFRESH_BACKOFF_MS = 120_000;

/** Minim 10s între apeluri reale `refreshSession` (toate tab-urile, prin localStorage). */
const MIN_REFRESH_INTERVAL_MS = 10_000;
const LAST_REFRESH_LS_KEY = "gobid_auth_last_refresh_ms";

let authRefreshBackoffUntil = 0;

function readLastRefreshFromStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(LAST_REFRESH_LS_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function writeLastRefreshToStorage(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_REFRESH_LS_KEY, String(ts));
  } catch {
    /* private mode / quota */
  }
}

/** După 429 la Supabase Auth — nu mai apela `recover`/`refresh` în buclă (evită spam și 401 în cascadă). */
export function isAuthRefreshBackoffActive(): boolean {
  return Date.now() < authRefreshBackoffUntil;
}

/** O singură cerere `refreshSession` în zbor pentru tot clientul (paralel `getSupabaseSessionRobust` = un singur POST). */
let refreshSessionInFlight: Promise<Session | null> | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const safe = promise.catch(() => null as unknown as T);
  try {
    return await Promise.race([
      safe,
      new Promise<null>((resolve) => {
        t = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Fără race: `getSession()` întârziat (main thread, Safari) nu mai „pierde” sesiunea la 2,5s. */
async function getSessionDirect(supabase: SupabaseClient): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const s = data?.session ?? null;
    if (s?.user && s.access_token) return s;
  } catch {
    return null;
  }
  return null;
}

async function getUserDirect(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}

function noteRefreshErrorForBackoff(err: unknown) {
  if (!err || typeof err !== "object") return;
  const o = err as { status?: number; message?: string };
  const msg = String(o.message || "");
  if (o.status === 429 || /over_request_rate_limit/i.test(msg)) {
    authRefreshBackoffUntil = Date.now() + AUTH_REFRESH_BACKOFF_MS;
    return;
  }
  if (/rate|429/i.test(msg)) {
    authRefreshBackoffUntil = Date.now() + Math.min(AUTH_REFRESH_BACKOFF_MS, 60_000);
  }
}

async function sharedRefreshSession(
  supabase: SupabaseClient,
  timeoutMs: number,
): Promise<Session | null> {
  if (Date.now() < authRefreshBackoffUntil) {
    return null;
  }

  const now = Date.now();
  const lastWall = readLastRefreshFromStorage();
  if (lastWall > 0 && now - lastWall < MIN_REFRESH_INTERVAL_MS) {
    return getSessionDirect(supabase);
  }

  const refreshBudget = Math.max(timeoutMs, AUTH_REFRESH_OPERATION_TIMEOUT_MS);

  if (!refreshSessionInFlight) {
    refreshSessionInFlight = (async () => {
      try {
        const raw = await withTimeout(supabase.auth.refreshSession(), refreshBudget);
        if (raw?.error) {
          noteRefreshErrorForBackoff(raw.error);
        }
        const s = raw?.data?.session ?? null;
        if (s?.user && s.access_token) {
          writeLastRefreshToStorage(Date.now());
          return s;
        }
        return null;
      } finally {
        refreshSessionInFlight = null;
      }
    })();
  }

  return refreshSessionInFlight;
}

/**
 * Un singur `refreshSession` în zbor pentru tot proiectul — folosește asta în loc de `supabase.auth.refreshSession()`
 * direct (altfel 429 la `/auth/v1/token`).
 */
export async function refreshSessionSingleFlight(
  supabase: SupabaseClient,
  timeoutMs: number = AUTH_CLIENT_CALL_TIMEOUT_MS
): Promise<Session | null> {
  return sharedRefreshSession(supabase, timeoutMs);
}

/**
 * getSession → refreshSession (deduplicat) → getUser + încă un refresh partajat dacă e nevoie.
 * Folosește înainte de operații Supabase care necesită JWT în client (cookie session).
 */
export async function getSupabaseSessionRobust(
  supabase: SupabaseClient,
  timeoutMs: number = AUTH_CLIENT_CALL_TIMEOUT_MS,
): Promise<Session | null> {
  if (Date.now() < authRefreshBackoffUntil) {
    const s = await getSessionDirect(supabase);
    if (s?.user && s.access_token) return s;
    return null;
  }

  const s0 = await getSessionDirect(supabase);
  if (s0?.user && s0.access_token) return s0;

  /** Un singur `refreshSession` per apel — `dashboardSessionRecovery` / alți calleri pot apela din nou după ce cookie-urile se propagă. */
  const rs = await sharedRefreshSession(supabase, timeoutMs);
  if (rs?.user && rs.access_token) return rs;

  const s1 = await getSessionDirect(supabase);
  if (s1?.user && s1.access_token) return s1;

  const user = await getUserDirect(supabase);
  if (user) {
    const s2 = await getSessionDirect(supabase);
    if (s2?.user && s2.access_token) return s2;
  }

  return null;
}

export async function getSupabaseAccessTokenRobust(
  supabase: SupabaseClient,
  timeoutMs?: number,
): Promise<string | null> {
  const s = await getSupabaseSessionRobust(supabase, timeoutMs);
  return s?.access_token ?? null;
}
