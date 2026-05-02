import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

type DeleteAccountRequestBody = {
  reason?: string;
};

/**
 * POST /api/auth/delete-account
 *
 * Soft-delete behavior:
 * - Keep user data in Supabase DB (public tables)
 * - Ban the Supabase Auth user so they can’t login with email+password
 * - Allow later "reactivation" by unbanning + setting a new password on re-register
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Service role key nu este configurat.' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Missing access token' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const admin = supabaseAdmin;

    // Validate token and get user identity
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return NextResponse.json(
        { success: false, message: 'Invalid access token' },
        { status: 401 }
      );
    }

    const userId = authData.user.id;
    const email = (authData.user.email || '').trim().toLowerCase() || null;
    const nowIso = new Date().toISOString();

    let reason: string | null = null;
    try {
      const body = (await request.json()) as DeleteAccountRequestBody;
      if (typeof body?.reason === 'string' && body.reason.trim()) {
        reason = body.reason.trim().slice(0, 500);
      }
    } catch {
      // ignore body parsing errors
    }

    // Ban user for a very long time (effectively disables login)
    let banError: any = null;
    const mergedAppMetadata = {
      ...(authData.user.app_metadata || {}),
      account_disabled: true,
      account_disabled_at: nowIso,
    };
    for (const ban_duration of ['876000h', '36500d']) {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration, app_metadata: mergedAppMetadata } as any);
      if (!error) {
        banError = null;
        break;
      }
      banError = error;
    }

    if (banError) {
      console.error('[Delete Account] Failed banning user:', banError);
      return NextResponse.json(
        { success: false, message: banError.message || 'Eroare la dezactivarea contului.' },
        { status: 500 }
      );
    }

    // Mark as deleted in user_profiles (best-effort).
    // If the DB migration wasn't applied or schema cache isn't refreshed, avoid failing the whole delete.
    try {
      const { error: profileError } = await admin
        .from('user_profiles')
        .upsert(
          {
            user_id: userId,
            ...(email ? { email } : {}),
            is_deleted: true,
            deleted_at: nowIso,
            deleted_reason: reason,
            reactivated_at: null,
          },
          { onConflict: 'user_id' }
        );

      if (profileError) {
        // Fallback: store deletion marker into metadata only (works with old schema)
        console.warn('[Delete Account] user_profiles upsert failed (will fallback):', profileError);
        const { data: existingProfile } = await admin
          .from('user_profiles')
          .select('metadata')
          .eq('user_id', userId)
          .maybeSingle();

        const mergedMetadata = {
          ...(((existingProfile as any)?.metadata as any) || {}),
          account_deleted: true,
          account_deleted_at: nowIso,
          account_deleted_reason: reason,
        };

        await admin
          .from('user_profiles')
          .upsert({ user_id: userId, metadata: mergedMetadata }, { onConflict: 'user_id' });
      }
    } catch (e) {
      console.warn('[Delete Account] user_profiles update skipped:', e);
    }

    // Revoke current session(s) best-effort
    try {
      await admin.auth.admin.signOut(accessToken, 'global');
    } catch (e) {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Delete Account] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

