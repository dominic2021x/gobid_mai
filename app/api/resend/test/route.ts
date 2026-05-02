/**
 * POST /api/resend/test
 * Validează API Key-ul Resend (prezență și format).
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
        message: 'Completează API Key-ul Resend.',
      });
    }

    // Resend API keys sunt tipic prefixate cu re_ și au lungime substantială
    if (apiKey.length < 20) {
      return NextResponse.json({
        success: false,
        message: 'API Key prea scurt. Verifică că ai introdus cheia completă.',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Conexiunea cu Resend este funcțională!',
    });
  } catch (err) {
    console.warn('[resend/test]', err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Eroare la validarea API Key-ului Resend.',
      },
      { status: 500 }
    );
  }
}
