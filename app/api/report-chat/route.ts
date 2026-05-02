import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getBearerOrCookieAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const user = await getBearerOrCookieAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const client = supabaseAdmin || supabase;

    // Verifică dacă utilizatorul este admin
    let isAdmin = false;
    if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
      isAdmin = true;
    } else {
      try {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile && profile.is_admin === true) {
          isAdmin = true;
        }
      } catch (e) {
        console.error('[API Report Chat] Error checking admin status:', e);
      }
    }

    // Obține conversațiile de rapoarte
    let chatsQuery = client
      .from('report_chats')
      .select(`
        *,
        user_reports (
          id,
          product_title,
          reported_user_name,
          reason,
          status,
          description
        )
      `)
      .order('updated_at', { ascending: false });

    // Dacă nu este admin, poate vedea doar propriile conversații
    if (!isAdmin) {
      chatsQuery = chatsQuery.eq('user_id', user.id) as any;
    }

    const { data: chats, error: chatsError } = await chatsQuery;

    // Filtrează chat-urile ascunse de utilizatorul curent
    let filteredChats = chats || [];
    if (chats) {
      filteredChats = chats.filter(chat => {
        const hiddenByUserIds = chat.hidden_by_user_ids || [];
        return !hiddenByUserIds.includes(user.id);
      });
    }

    if (chatsError) {
      console.error('[API Report Chat] Get chats error:', chatsError);
      return NextResponse.json(
        { error: 'Failed to fetch report chats', details: chatsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, chats: filteredChats });
  } catch (error: any) {
    console.error('[API Report Chat] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
