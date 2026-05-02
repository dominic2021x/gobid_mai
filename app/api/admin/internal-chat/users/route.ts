import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ADMIN_ROLES = ['admin', 'superadmin', 'administrator', 'super_user', 'manager'];

async function isAdminUser(user: any, supabaseAdmin: any): Promise<boolean> {
  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
    return true;
  }

  const metaRole =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);

  const roles = new Set<string>();
  if (metaRole) roles.add(String(metaRole).toLowerCase());
  if (Array.isArray(user?.app_metadata?.roles)) {
    user.app_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (user?.user_metadata?.roles && Array.isArray(user.user_metadata.roles)) {
    user.user_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }

  if (Array.from(roles).some((role) => ADMIN_ROLES.includes(role))) {
    return true;
  }

  if (user?.id && supabaseAdmin) {
    try {
      const { data: profile, error } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && profile?.is_admin === true) {
        return true;
      }
    } catch (e) {
      console.error('Error checking admin status:', e);
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
  }

  const accessToken = authHeader.replace('Bearer ', '').trim();

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const isAdmin = await isAdminUser(authUser.user, supabaseAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all admin/manager users
    const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });

    if (listError) {
      console.error('Error listing users:', listError);
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
    }

    const allUsers = usersPage?.users ?? [];
    
    // Filter out deleted or banned users
    const activeUsers = allUsers.filter((u: any) => {
      // Exclude deleted users (they have deleted_at set)
      if (u.deleted_at) return false;
      // Exclude banned users
      if (u.banned_until && new Date(u.banned_until) > new Date()) return false;
      return true;
    });
    
    const userIds = activeUsers.map((u: any) => u.id);

    // Get profiles - only for active users
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, first_name, last_name, avatar_url, role')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error loading profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 });
    }

    const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    // Filter and format admin/manager users
    const adminUsers = activeUsers
      .filter((user: any) => {
        // Only include users that have a profile (not deleted from user_profiles)
        const profile = profilesMap.get(user.id);
        if (!profile) return false; // Exclude users without profile
        
        // Check if user is admin/manager
        const profileRole = profile?.role ? String(profile.role).toLowerCase() : '';
        const metaRole =
          profileRole ||
          user?.user_metadata?.role ||
          user?.app_metadata?.role ||
          (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);
        
        const normalizedRole = typeof metaRole === 'string' ? metaRole.toLowerCase() : '';
        const isAdminFlag =
          profile?.is_admin === true ||
          ADMIN_ROLES.includes(normalizedRole) ||
          user?.user_metadata?.is_admin === true ||
          user?.app_metadata?.is_admin === true;

        return isAdminFlag;
      })
      .map((user: any) => {
        const profile = profilesMap.get(user.id) || {};
        return {
          id: user.id,
          email: user.email,
          firstName: profile.first_name || user.user_metadata?.first_name || '',
          lastName: profile.last_name || user.user_metadata?.last_name || '',
          avatar: profile.avatar_url || user.user_metadata?.avatar_url || '',
          name: `${profile.first_name || user.user_metadata?.first_name || ''} ${profile.last_name || user.user_metadata?.last_name || ''}`.trim() || user.email,
        };
      })
      .filter((u: any) => u.id !== authUser.user.id); // Exclude current user

    return NextResponse.json({ users: adminUsers });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
