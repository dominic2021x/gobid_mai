/**
 * Admin API auth: require Supabase session with admin/manager role.
 * Use in API routes: const auth = await requireAdmin(request); if (!auth.ok) return auth.response;
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

const ADMIN_ROLES = ["admin", "superadmin", "administrator", "super_user", "manager"];

/** Server-only: check if user has admin role. Exported for use in Server Components (e.g. preview gate). */
export async function isAdminUser(user: User, adminClient: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) return true;

  const metaRole =
    user?.user_metadata?.role ??
    user?.app_metadata?.role ??
    (Array.isArray(user?.app_metadata?.roles) ? (user.app_metadata.roles as string[])[0] : undefined);

  const roles = new Set<string>();
  if (metaRole) roles.add(String(metaRole).toLowerCase());
  if (Array.isArray(user?.app_metadata?.roles)) {
    (user.app_metadata.roles as string[]).forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (Array.isArray(user?.user_metadata?.roles)) {
    (user.user_metadata.roles as string[]).forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (Array.from(roles).some((role) => ADMIN_ROLES.includes(role))) return true;

  if (user?.id && adminClient) {
    try {
      const { data: profile, error } = await adminClient
        .from("user_profiles")
        .select("is_admin, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && profile?.is_admin === true) return true;
      const profileRole = String(
        (profile as { role?: string | null })?.role ?? ""
      )
        .toLowerCase()
        .trim();
      if (profileRole && ADMIN_ROLES.includes(profileRole)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export type RequireAdminResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
  if (!supabaseAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Server misconfiguration" }, { status: 500 }) };
  }

  let authenticatedUser: User | null = null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.replace("Bearer ", "").trim();
    if (accessToken) {
      const { data: authUser, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (!error && authUser?.user) {
        authenticatedUser = authUser.user;
      }
    }
  }

  // Admin panel: same as GET /api/admin/users — cookie session when Bearer is absent.
  if (!authenticatedUser) {
    try {
      const supabaseServer = await createServerClient();
      const { data: cookieAuth, error: cookieErr } = await supabaseServer.auth.getUser();
      if (!cookieErr && cookieAuth?.user) {
        authenticatedUser = cookieAuth.user;
      }
    } catch {
      // ignore
    }
  }

  if (!authenticatedUser) {
    return { ok: false, response: NextResponse.json({ error: "Missing access token" }, { status: 401 }) };
  }

  const allowed = await isAdminUser(authenticatedUser, supabaseAdmin);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, user: authenticatedUser };
}
