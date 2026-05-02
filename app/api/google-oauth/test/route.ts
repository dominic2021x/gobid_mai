/**
 * POST /api/google-oauth/test
 * Validează configurația Google OAuth (Client ID, Client Secret, Redirect URI).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientId,
      clientSecret,
      redirectUri,
    } = (body || {}) as { clientId?: string; clientSecret?: string; redirectUri?: string };

    if (!clientId || String(clientId).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Client ID lipsă. Completează Google OAuth Client ID în configurare.',
      });
    }

    if (!clientSecret || String(clientSecret).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Client Secret lipsă. Completează Google OAuth Client Secret în configurare.',
      });
    }

    if (!redirectUri || !String(redirectUri).startsWith('http')) {
      return NextResponse.json({
        success: false,
        message: 'Redirect URI invalid. Trebuie să fie o adresă URL completă (ex: https://...).',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Configurația Google OAuth este validă!',
    });
  } catch (err) {
    console.warn('[google-oauth/test]', err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Eroare la validarea configurației.',
      },
      { status: 500 }
    );
  }
}
