import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSupabaseCookieClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isAuthRetryableTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const status = typeof e.status === "number" ? e.status : undefined;
  const name = typeof e.name === "string" ? e.name : "";
  const marker = e.__isAuthError === true;
  const message = typeof e.message === "string" ? e.message : "";
  return (
    status === 504 ||
    marker ||
    name.includes("AuthRetryableFetchError") ||
    message.includes("AuthRetryableFetchError")
  );
}

function isNextRequest(request: Request): request is NextRequest {
  return typeof (request as NextRequest).cookies?.getAll === "function";
}

/** Când `request.cookies.getAll()` e gol dar headerul `Cookie:` există (unele POST / Firefox). */
function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header?.trim()) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out.push({ name, value });
  }
  return out;
}

/**
 * Validare strictă: doar `getUser()` (JWT validat față de Auth), fără `getSession()` care poate
 * întoarce sesiune locală nevalidată și produce inconsistențe 401/200.
 */
async function getUserFromSupabaseCookieAdapter(
  getAll: () => { name: string; value: string }[],
): Promise<User | null> {
  try {
    const supabase = createSupabaseCookieClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll,
        setAll() {
          /* citire-only */
        },
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (user && !error) return user;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Cookie-uri de pe Request (inclusiv parsare brută din headerul `Cookie:`).
 */
async function getUserFromRequestCookies(request: Request): Promise<User | null> {
  if (isNextRequest(request)) {
    const fromApi = await getUserFromSupabaseCookieAdapter(() =>
      request.cookies.getAll(),
    );
    if (fromApi) return fromApi;
  }
  const raw = request.headers.get("cookie") ?? request.headers.get("Cookie");
  const parsed = parseCookieHeader(raw);
  if (parsed.length === 0) return null;
  return getUserFromSupabaseCookieAdapter(() => parsed);
}

/**
 * Validează un JWT și întoarce user-ul (ex. scripturi server, migrări).
 * Nu face parte din fluxul standard `getRequestAuthUser` (cookie-only).
 */
export async function getUserFromJwt(jwt: string): Promise<User | null> {
  if (supabaseAdmin) {
    try {
      const { data: authUser, error } = await supabaseAdmin.auth.getUser(jwt);
      if (!error && authUser?.user) return authUser.user;
    } catch (err) {
      if (!isAuthRetryableTimeoutError(err)) {
        // eslint-disable-next-line no-console
        console.error("[auth] getUserFromJwt(admin) failed:", err);
      }
    }
  }
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: authUser, error } = await anon.auth.getUser(jwt);
    if (!error && authUser?.user) return authUser.user;
  } catch (err) {
    if (!isAuthRetryableTimeoutError(err)) {
      // eslint-disable-next-line no-console
      console.error("[auth] getUserFromJwt(anon) failed:", err);
    }
  }
  return null;
}

/**
 * Utilizator pentru Route Handlers: **doar** sesiune din cookie-uri + `getUser()`.
 * Fără `getSession()` fallback, fără `Authorization`, fără token în query/body — aceeași sursă de
 * adevăr ca în documentația Supabase pentru cod server.
 */
export async function getRequestAuthUser(request: Request): Promise<User | null> {
  const debug = process.env.DEBUG_AUTH === "1";

  try {
    const supabase = await createServerClient();
    const {
      data: { user: validatedUser },
      error: userError,
    } = await supabase.auth.getUser();
    if (validatedUser && !userError) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log("[DEBUG_AUTH] user from getUser() (cookies):", validatedUser.id);
      }
      return validatedUser;
    }
  } catch (e) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[DEBUG_AUTH] createServerClient getUser error:", e);
    }
  }

  const fromRequestCookies = await getUserFromRequestCookies(request);
  if (fromRequestCookies) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[DEBUG_AUTH] user from Request cookies + getUser():", fromRequestCookies.id);
    }
    return fromRequestCookies;
  }

  if (debug) {
    try {
      const { cookies } = await import("next/headers");
      const store = await cookies();
      // eslint-disable-next-line no-console
      console.log(
        "[DEBUG_AUTH] unauthenticated; cookie names:",
        store.getAll().map((c) => c.name),
      );
    } catch {
      // eslint-disable-next-line no-console
      console.log("[DEBUG_AUTH] unauthenticated (could not list cookies)");
    }
  }

  return null;
}

/**
 * Pentru route handlers apelate din dashboard cu `credentials: "include"` (fără `Authorization`):
 * încearcă JWT din `Authorization: Bearer`, apoi sesiunea din cookie (ca `getRequestAuthUser`).
 */
export async function getBearerOrCookieAuthUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ") && supabaseAdmin) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const { data: authUser, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && authUser?.user) return authUser.user;
      } catch (err) {
        if (!isAuthRetryableTimeoutError(err)) {
          // eslint-disable-next-line no-console
          console.error("[auth] Bearer validation failed:", err);
        }
      }
    }
  }
  return getRequestAuthUser(request);
}
