/**
 * GET /api/search/history
 * Returnează istoricul căutărilor pentru utilizatorul autentificat.
 * Folosit de /api/search/suggestions pentru sugestii personalizate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ history: [] });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ history: [] });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ history: [] });
    }

    const userId = authData.user.id;
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 50);

    // Încearcă tabelul search_history (user_id, query, created_at)
    const { data: rows, error } = await supabaseAdmin
      .from('search_history')
      .select('query, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // Tabel inexistent sau altă eroare → răspuns gol
      return NextResponse.json({ history: [] });
    }

    const history = (rows || []).map((r: { query?: string; created_at?: string }) => ({
      query: r.query ?? '',
      created_at: r.created_at,
    }));

    return NextResponse.json({ history });
  } catch (err) {
    console.warn('[search/history]', err);
    return NextResponse.json({ history: [] });
  }
}
