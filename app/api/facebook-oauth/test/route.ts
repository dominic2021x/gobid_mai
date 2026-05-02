/**
 * POST /api/facebook-oauth/test
 * Validează configurația Facebook OAuth (App ID, redirect URI, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      appId,
      appSecret,
      redirectUri,
    } = (body || {}) as { appId?: string; appSecret?: string; redirectUri?: string };

    if (!appId || String(appId).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'App ID lipsă. Completează Facebook App ID în configurare.',
      });
    }

    if (!/^\d+$/.test(String(appId).trim())) {
      return NextResponse.json({
        success: false,
        message: 'App ID invalid. App ID-ul Facebook trebuie să fie un număr.',
      });
    }

    if (!appSecret || String(appSecret).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'App Secret lipsă. Completează Facebook App Secret în configurare.',
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
      message: 'Configurația Facebook OAuth este validă și gata de utilizare.',
    });
  } catch (err) {
    console.warn('[facebook-oauth/test]', err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Eroare la validarea configurației.',
      },
      { status: 500 }
    );
  }
}
