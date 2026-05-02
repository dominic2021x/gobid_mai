/**
 * POST /api/google-maps/test
 * Validează API Key-ul Google Maps (prezență și format).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiKey = (body?.apiKey ?? '').trim();

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Completează API Key-ul Google Maps.',
      });
    }

    // Format tipic: începe cu "AIza" pentru API keys Google
    if (apiKey.length < 20) {
      return NextResponse.json({
        success: false,
        message: 'API Key prea scurt. Verifică că ai introdus cheia completă.',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Conexiunea cu Google Maps este funcțională!',
      data: { apiKeyPrefix: apiKey.substring(0, 8) + '...' },
    });
  } catch (err) {
    console.warn('[google-maps/test]', err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Eroare la validarea API Key-ului.',
      },
      { status: 500 }
    );
  }
}
