import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ADMIN_ROLES = ['super_user', 'superuser', 'owner', 'admin', 'superadmin', 'administrator'];

function normalizeRole(user: any): string | undefined {
  const role =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);
  return typeof role === 'string' ? role.toLowerCase() : undefined;
}

async function isSuperAdmin(user: any, supabaseAdmin: any): Promise<boolean> {
  if (!user) return false;
  
  // Check metadata first (fast check)
  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
    return true;
  }
  
  const role = normalizeRole(user);
  if (role && ADMIN_ROLES.includes(role)) {
    return true;
  }

  // Check user_profiles table as fallback
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
      console.error('Error checking admin status in user_profiles:', e);
    }
  }

  return false;
}

async function getAuthUser(request: NextRequest) {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured.');
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) {
        return data.user;
      }
    }
  }

  // Fallback for requests authenticated via Supabase session cookies.
  const supabaseServer = await createServerClient();
  const { data: cookieAuthData, error: cookieAuthError } = await supabaseServer.auth.getUser();
  if (!cookieAuthError && cookieAuthData?.user) {
    return cookieAuthData.user;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }
    const authUser = await getAuthUser(request);
    if (!authUser || !(await isSuperAdmin(authUser, supabaseAdmin))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetUserId = request.nextUrl.searchParams.get('userId');
    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('admin_page_permissions')
      .select('page_slug, can_access')
      .eq('user_id', targetUserId);

    if (error) {
      console.error('Error fetching admin permissions:', error);
      return NextResponse.json({ error: 'Failed to load permissions' }, { status: 500 });
    }

    return NextResponse.json({
      permissions: (data ?? []).map((row) => ({
        page: row.page_slug,
        canAccess: row.can_access,
      })),
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/users/permissions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }
    const authUser = await getAuthUser(request);
    if (!authUser || !(await isSuperAdmin(authUser, supabaseAdmin))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { userId, permissions } = body as {
      userId?: string;
      permissions?: Array<{ page: string; canAccess: boolean }>;
    };

    if (!userId || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'userId and permissions are required' }, { status: 400 });
    }

    const sanitized = permissions
      .filter(
        (entry) =>
          entry &&
          typeof entry.page === 'string' &&
          entry.page.trim().length > 0 &&
          typeof entry.canAccess === 'boolean'
      )
      .map((entry) => ({
        user_id: userId,
        page_slug: entry.page.trim(),
        can_access: entry.canAccess,
        granted_by: authUser.id,
        granted_at: new Date().toISOString(),
      }));

    const { error: upsertError } = await supabaseAdmin.from('admin_page_permissions').upsert(
      sanitized,
      {
        onConflict: 'user_id,page_slug',
      }
    );

    if (upsertError) {
      console.error('Error saving admin permissions:', upsertError);
      return NextResponse.json({ error: 'Failed to save permissions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/users/permissions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}







