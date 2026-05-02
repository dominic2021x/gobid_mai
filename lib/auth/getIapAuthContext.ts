import { supabase } from '@/lib/supabase';
import { refreshSessionSingleFlight } from '@/lib/auth/getSupabaseSessionRobust';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value.trim()));
}

function pickUserIdFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return isUuid(t) ? t : null;
}

/**
 * Reads Supabase session blobs that @supabase/supabase-js may persist under
 * keys like `sb-<project-ref>-auth-token` (shape varies by version).
 */
function scanLocalStorageForSupabaseSession(): {
  accessToken: string | null;
  userId: string | null;
} {
  if (typeof window === 'undefined') return { accessToken: null, userId: null };

  let accessToken: string | null = null;
  let userId: string | null = null;

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes('auth-token')) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        continue;
      }

      const candidates: unknown[] = [];
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>;
        candidates.push(o.currentSession, o.session, parsed);
      }

      for (const c of candidates) {
        if (!c || typeof c !== 'object') continue;
        const s = c as Record<string, unknown>;
        const tok = typeof s.access_token === 'string' ? s.access_token : null;
        const uid =
          s.user && typeof s.user === 'object'
            ? pickUserIdFromUnknown((s.user as Record<string, unknown>).id as unknown)
            : null;
        if (tok && !accessToken) accessToken = tok;
        if (uid && !userId) userId = uid;
      }
    }
  } catch {
    // ignore
  }

  return { accessToken, userId };
}

function readUserInfoFallbackUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('userInfo');
    if (!raw) return null;
    const u = JSON.parse(raw) as Record<string, unknown>;
    return (
      pickUserIdFromUnknown(u.supabaseUserId) ||
      pickUserIdFromUnknown(u.userId) ||
      pickUserIdFromUnknown(u.id)
    );
  } catch {
    return null;
  }
}

export type IapAuthContext = {
  accessToken: string | null;
  userId: string | null;
};

/**
 * Resolves access token + Supabase user id for native IAP flows.
 * Capacitor / WebView sometimes has no in-memory session until refresh,
 * or keeps the user id only inside `userInfo` instead of `supabaseUserId`.
 */
export async function getIapAuthContext(hintUserId?: string | null): Promise<IapAuthContext> {
  let accessToken: string | null = null;
  let userId: string | null =
    hintUserId != null && isUuid(hintUserId) ? hintUserId.trim() : null;

  let { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  if (!session?.access_token) {
    const refreshed = await refreshSessionSingleFlight(supabase);
    if (refreshed) {
      session = refreshed;
    }
  }

  accessToken = session?.access_token ?? null;
  userId = userId || pickUserIdFromUnknown(session?.user?.id as unknown) || null;

  // În WebView/Capacitor, uneori `getUser()` are user valid după refresh, dar session în memorie e incompletă
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser();
    userId = pickUserIdFromUnknown(userData.user?.id as unknown);
  }

  if (!accessToken) {
    const { data: again } = await supabase.auth.getSession();
    accessToken = again.session?.access_token ?? accessToken;
  }

  if (!userId) {
    const fromKey = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseUserId') : null;
    userId = pickUserIdFromUnknown(fromKey);
  }

  if (!userId) {
    userId = readUserInfoFallbackUserId();
  }

  if (!accessToken || !userId) {
    const scanned = scanLocalStorageForSupabaseSession();
    accessToken = accessToken || scanned.accessToken;
    userId = userId || scanned.userId;
  }

  return { accessToken, userId };
}
