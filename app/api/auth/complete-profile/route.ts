/**
 * POST /api/auth/complete-profile
 * Saves first_name and last_name from onboarding (e.g. after Apple Sign In with no name).
 * Uses source: onboarding_manual so upsertUserProfile treats them as trusted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { upsertUserProfile } from '@/lib/auth/profile/upsertUserProfile';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


function trim(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim();
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Necesită autentificare' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const firstName = trim(body.firstName ?? body.first_name ?? '');
    const lastName = trim(body.lastName ?? body.last_name ?? '');

    if (!firstName && !lastName) {
      return NextResponse.json(
        { success: false, error: 'Introdu prenumele sau numele' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    await upsertUserProfile(supabaseAdmin, {
      userId: user.id,
      firstName: firstName || null,
      lastName: lastName || null,
      source: 'onboarding_manual',
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[complete-profile]', e);
    return NextResponse.json(
      { success: false, error: 'Eroare la salvarea profilului' },
      { status: 500 }
    );
  }
}
