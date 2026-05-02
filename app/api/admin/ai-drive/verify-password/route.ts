/**
 * POST /api/admin/ai-drive/verify-password
 * Verifică parola pentru accesul la pagina AI Drive (informații sensibile).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const AI_DRIVE_PASSWORD = process.env.AI_DRIVE_PASSWORD;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!AI_DRIVE_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'AI Drive password not configured' },
        { status: 503 }
      );
    }

    const valid = password === AI_DRIVE_PASSWORD;
    return NextResponse.json({ success: valid });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
