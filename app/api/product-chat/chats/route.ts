/**
 * GET /api/product-chat/chats
 * Listă conversațiile (product_chats) în care utilizatorul autentificat este buyer sau seller.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing authorization token' },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = authHeader.substring(7);
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'Invalid token' },
        { status: 401 }
      );
    }

    const userId = authUser.user.id;

    const { data: chats, error } = await supabaseAdmin
      .from('product_chats')
      .select('*')
      .or(`buyer_user_id.eq.${userId},seller_user_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('[product-chat/chats] Error loading chats:', error);
      return NextResponse.json(
        { error: 'Failed to load chats', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ chats: chats ?? [] });
  } catch (err) {
    console.error('[product-chat/chats]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
