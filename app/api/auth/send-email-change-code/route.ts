import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { storeVerificationCode } from '@/lib/verification-codes';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * POST /api/auth/send-email-change-code
 * Trimite un cod de 6 cifre la noul email. Codul trebuie introdus pentru a confirma schimbarea.
 * Body: { newEmail }
 * Header: Authorization: Bearer <access_token>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Lipsește tokenul de autentificare.' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Service role key nu este configurat.' },
        { status: 500 }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return NextResponse.json(
        { success: false, message: 'Token invalid sau expirat.' },
        { status: 401 }
      );
    }

    const userId = authData.user.id;
    const currentEmail = (authData.user.email || '').trim().toLowerCase();

    const body = await request.json().catch(() => ({}));
    const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';

    if (!newEmail || !newEmail.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'Introdu un email nou valid.' },
        { status: 400 }
      );
    }

    if (newEmail === currentEmail) {
      return NextResponse.json(
        { success: false, message: 'Noul email este același cu cel actual.' },
        { status: 400 }
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    storeVerificationCode(newEmail, code, userId, 15);

    const apiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'Trimiterea de email nu este configurată.' },
        { status: 500 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || 'noreply@gobid.ro';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gobid.ro');
    const logoUrl = `${baseUrl}/logo_negru.png`;

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="ro">
        <head><meta charset="utf-8"><title>Schimbare email - GoBid</title></head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;line-height:1.6;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td align="center" style="padding:40px 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:500px;margin:0 auto;">
                <tr><td align="center" style="padding:0 0 24px 0;"><img src="${logoUrl}" alt="GoBid" style="max-width:140px;height:auto;" /></td></tr>
                <tr><td style="padding:0;">
                  <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:600;color:#111827;text-align:center;">Schimbare email de logare</h1>
                  <p style="margin:0 0 24px 0;font-size:16px;color:#6b7280;text-align:center;">Ai solicitat schimbarea email-ului de logare pe GoBid. Introdu codul de mai jos în setări pentru a confirma.</p>
                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px 0;">
                    <span style="font-size:32px;font-weight:600;letter-spacing:8px;color:#111827;font-family:monospace;">${code}</span>
                  </div>
                  <p style="margin:0;font-size:14px;color:#9ca3af;text-align:center;">Codul expiră în 15 minute. Dacă nu ai solicitat schimbarea, poți ignora acest email.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: newEmail,
        subject: 'Cod pentru schimbarea email-ului - GoBid',
        html: emailHtml,
        text: `Cod pentru schimbarea email-ului pe GoBid: ${code}\n\nExpiră în 15 minute.`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, message: (err as any)?.message || 'Eroare la trimiterea email-ului.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cod trimis la noul email. Verifică căsuța de poștă și introdu codul în setări.',
    });
  } catch (error: any) {
    console.error('[send-email-change-code]', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Eroare la trimiterea codului.' },
      { status: 500 }
    );
  }
}
