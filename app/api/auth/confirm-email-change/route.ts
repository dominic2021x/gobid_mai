import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerificationCode, deleteVerificationCode } from '@/lib/verification-codes';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * POST /api/auth/confirm-email-change
 * Confirmă schimbarea email-ului cu codul primit la noul email.
 * Body: { newEmail, code }
 * Dacă codul e corect: actualizează auth.users.email și user_profiles.email.
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Service role key nu este configurat.' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (!newEmail || !newEmail.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'Email nou invalid.' },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'Introdu codul primit pe email.' },
        { status: 400 }
      );
    }

    const stored = getVerificationCode(newEmail);
    if (!stored) {
      return NextResponse.json(
        { success: false, message: 'Cod invalid sau expirat. Solicită un cod nou.' },
        { status: 400 }
      );
    }

    if (stored.code !== code) {
      return NextResponse.json(
        { success: false, message: 'Cod incorect. Verifică și încearcă din nou.' },
        { status: 400 }
      );
    }

    const userId = stored.userId;

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });

    if (updateAuthError) {
      console.error('[confirm-email-change] Auth update error:', updateAuthError);
      return NextResponse.json(
        { success: false, message: updateAuthError.message || 'Eroare la actualizarea email-ului.' },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from('user_profiles')
      .update({ email: newEmail })
      .eq('user_id', userId);

    deleteVerificationCode(newEmail);

    return NextResponse.json({
      success: true,
      message: 'Email actualizat cu succes. De acum te poți loga cu noul email.',
      email: newEmail,
    });
  } catch (error: any) {
    console.error('[confirm-email-change]', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Eroare la confirmarea schimbării.' },
      { status: 500 }
    );
  }
}
