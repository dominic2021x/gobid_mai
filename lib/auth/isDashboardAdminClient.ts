import type { User } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'administrator', 'super_user']);

export type ProfileAdminGateFields = {
  role?: string | null;
  is_admin?: boolean | null;
};

/**
 * Cont admin staff (fără manager) — aceeași bază ca `dashboard/layout.tsx` pentru `isAdmin`.
 * Include `adminInfo` din localStorage după login pe `/admin`.
 */
export function isDashboardAdminClient(
  user: User | null,
  profile: ProfileAdminGateFields | null | undefined,
  adminInfoJson: string | null | undefined
): boolean {
  if (typeof window !== 'undefined' && adminInfoJson) {
    try {
      const adminInfo = JSON.parse(adminInfoJson) as { isAdmin?: boolean };
      if (adminInfo.isAdmin === true) return true;
    } catch {
      /* ignore */
    }
  }
  if (!user) return false;

  const um = user.user_metadata as { is_admin?: boolean; role?: string } | undefined;
  const am = user.app_metadata as { is_admin?: boolean; role?: string } | undefined;
  if (um?.is_admin === true || am?.is_admin === true) return true;

  const normalizedRole = String(um?.role ?? am?.role ?? profile?.role ?? '').toLowerCase();
  if (profile?.is_admin === true) return true;
  if (ADMIN_ROLES.has(normalizedRole)) return true;

  return false;
}
