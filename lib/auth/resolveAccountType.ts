import type { SupabaseClient, User } from '@supabase/supabase-js';
import { refreshSessionSingleFlight } from '@/lib/auth/getSupabaseSessionRobust';

const SUPABASE_USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID utilizator Supabase (nu email). Folosit la aceleași verificări ca `dashboard/layout.tsx`. */
export function looksLikeSupabaseUserId(v: unknown): boolean {
  return typeof v === 'string' && SUPABASE_USER_UUID_RE.test(v.trim());
}

/**
 * Dovezi locale că utilizatorul e logat în app. Layout-ul permite `/dashboard/*` pe baza lor;
 * paginile copil nu trebuie să trimită la `/auth` când `getSession()` e încă gol (WebView/iPad).
 */
export function hasDashboardLocalAuthEvidence(): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('supabaseUserId')) return true;
  if (localStorage.getItem('adminInfo')) return true;
  try {
    const raw = localStorage.getItem('userInfo');
    if (!raw) return false;
    const ui = JSON.parse(raw) as Record<string, unknown>;
    const email = ui.email;
    return Boolean(
      (typeof email === 'string' && email.trim().length > 0) ||
        looksLikeSupabaseUserId(ui.supabaseUserId) ||
        looksLikeSupabaseUserId(ui.userId) ||
        looksLikeSupabaseUserId(ui.id)
    );
  } catch {
    return false;
  }
}

export type ResolvedAccountContext = {
  user: User | null;
  /** Poate lipsi la primul getSession() în WebView; după refresh/getUser poate fi completat */
  accountType: string | undefined;
};

function readStoredAccountType(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('accountType');
    if (raw === 'executor' || raw === 'liquidator') return raw;
    const ui = JSON.parse(localStorage.getItem('userInfo') || '{}') as Record<string, unknown>;
    const t = ui.accountType ?? ui.account_type;
    if (t === 'executor' || t === 'liquidator') return String(t);
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Rezolvă user + account_type în mod robust (Capacitor/WebView: metadata poate lipsi la getSession()).
 */
export async function resolveAccountTypeWithUser(
  supabase: SupabaseClient
): Promise<ResolvedAccountContext> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  let accountType = user?.user_metadata?.account_type as string | undefined;

  if (accountType === 'executor' || accountType === 'liquidator') {
    return { user, accountType };
  }

  const refreshed = await refreshSessionSingleFlight(supabase);
  if (refreshed?.user) {
    user = refreshed.user;
    accountType = user.user_metadata?.account_type as string | undefined;
    if (accountType === 'executor' || accountType === 'liquidator') {
      return { user, accountType };
    }
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    user = userData.user;
    accountType = user.user_metadata?.account_type as string | undefined;
    if (accountType === 'executor' || accountType === 'liquidator') {
      return { user, accountType };
    }
  }

  const stored = readStoredAccountType();
  if (stored) {
    return { user, accountType: stored };
  }

  return { user, accountType };
}

/**
 * Doar JWT (getSession → refreshSession → getUser), **fără** fallback localStorage.
 * Folosește la redirect din `/dashboard/*` către `/dashboard/executor/*`: localStorage cu
 * `accountType` învechit poate trimite greșit utilizatori privați pe ruta de executor,
 * care apoi îi redirecționează înapoi la `/dashboard` (efect „flash”).
 */
export async function resolveAccountTypeFromJwtOnly(
  supabase: SupabaseClient
): Promise<ResolvedAccountContext> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  let accountType = user?.user_metadata?.account_type as string | undefined;

  if (accountType === 'executor' || accountType === 'liquidator') {
    return { user, accountType };
  }

  const refreshed = await refreshSessionSingleFlight(supabase);
  if (refreshed?.user) {
    user = refreshed.user;
    accountType = user.user_metadata?.account_type as string | undefined;
    if (accountType === 'executor' || accountType === 'liquidator') {
      return { user, accountType };
    }
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    user = userData.user;
    accountType = user.user_metadata?.account_type as string | undefined;
  }

  return { user, accountType };
}

/**
 * getSession + getUser, **fără** `refreshSession()`.
 * Folosește în `onAuthStateChange` / `loadUserState` repetat: altfel
 * `refreshSession` → eveniment TOKEN_REFRESHED → listener → iar refresh → buclă infinită (refresh la fiecare secundă).
 */
export async function readAccountTypeWithoutRefresh(
  supabase: SupabaseClient
): Promise<ResolvedAccountContext> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  let accountType = user?.user_metadata?.account_type as string | undefined;

  if (accountType === 'executor' || accountType === 'liquidator') {
    return { user, accountType };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    user = userData.user;
    accountType = user.user_metadata?.account_type as string | undefined;
  }

  return { user, accountType };
}

/**
 * True = utilizatorul NU are voie pe rutele /dashboard/executor/* sau /dashboard/lichidator/*
 * (cont privat, firmă, etc.). False dacă account_type lipsește — nu împinge utilizatorul
 * înapoi la /dashboard din cauza unei erori temporare de metadata în app.
 */
export function shouldRedirectAwayFromExecutorRoutes(accountType: string | undefined): boolean {
  if (accountType == null || accountType === '') return false;
  if (accountType === 'executor' || accountType === 'liquidator') return false;
  return true;
}
