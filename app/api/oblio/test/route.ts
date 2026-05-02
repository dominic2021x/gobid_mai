/**
 * API Route pentru testarea conexiunii Oblio.eu
 * POST /api/oblio/test
 * Body: { clientId: string (email), clientSecret: string (token din Setări > Date Cont) }
 */

import { NextRequest, NextResponse } from 'next/server';
import { testOblioConnection } from '@/modules/oblio';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, clientSecret } = body;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, message: 'Email (clientId) și token-ul (clientSecret) sunt obligatorii.' },
        { status: 400 }
      );
    }

    const result = await testOblioConnection({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        companies: result.companies,
      },
      { status: result.success ? 200 : 400 }
    );
  } catch (error: any) {
    console.error('Error in /api/oblio/test:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Eroare la testarea conexiunii Oblio.',
      },
      { status: 500 }
    );
  }
}
