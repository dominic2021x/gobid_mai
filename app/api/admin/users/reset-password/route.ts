import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ADMIN_ROLES = ['admin', 'superadmin', 'administrator'];

async function isAdminUser(user: any, supabaseAdmin: any): Promise<boolean> {
  // Check metadata first (fast check)
  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
    return true;
  }

  const roles = new Set<string>();

  const metaRole =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);

  if (metaRole) roles.add(String(metaRole).toLowerCase());

  if (Array.isArray(user?.app_metadata?.roles)) {
    user.app_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (Array.isArray(user?.user_metadata?.roles)) {
    user.user_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }

  if (Array.from(roles).some((role) => ADMIN_ROLES.includes(role))) {
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

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { userId, newPassword } = body ?? {};

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId și newPassword sunt obligatorii' }, { status: 400 });
    }

    if (String(newPassword).trim().length < 8) {
      return NextResponse.json(
        { error: 'Parola trebuie să aibă cel puțin 8 caractere' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error('Failed to reset user password:', updateError);
      return NextResponse.json({ error: 'Nu am putut actualiza parola utilizatorului' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error resetting password:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}







