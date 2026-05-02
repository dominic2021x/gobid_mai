/**
 * GET /api/tts/enabled
 * Returnează dacă TTS este activat pentru utilizatorul autentificat.
 * Header: Authorization: Bearer <token>
 * Response: { enabled: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ enabled: false });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ enabled: false });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ enabled: false });
    }

    const { data: row } = await supabaseAdmin
      .from('user_settings')
      .select('data')
      .eq('user_id', authData.user.id)
      .eq('category', 'tts')
      .maybeSingle();

    const data = row?.data as { enabled?: boolean } | undefined;
    const enabled = data?.enabled === true;

    return NextResponse.json({ enabled });
  } catch (err) {
    console.warn('[tts/enabled]', err);
    return NextResponse.json({ enabled: false });
  }
}
