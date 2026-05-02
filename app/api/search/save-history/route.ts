/**
 * POST /api/search/save-history
 * Salvează o căutare în istoricul utilizatorului.
 * Body: { query, resultsCount?, userId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const userId = body?.userId ?? null;

    if (!query || !userId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false }, { status: 500 });
    }

    const { error } = await supabaseAdmin.from('search_history').insert({
      user_id: userId,
      query,
    });

    if (error) {
      // Tabel inexistent sau constraint → nu spargem flow-ul
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.warn('[search/save-history]', err);
    return NextResponse.json({ success: true });
  }
}
