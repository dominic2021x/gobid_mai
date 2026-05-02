import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getBearerOrCookieAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const client = supabaseAdmin || supabase;

    // Verifică dacă utilizatorul are acces la această conversație
    const { data: chat, error: chatError } = await client
      .from('report_chats')
      .select('user_id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Verifică dacă este admin
    let isAdmin = false;
    try {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (profile && profile.is_admin === true) {
        isAdmin = true;
      }
    } catch (e) {
      console.error('[API Report Chat Messages] Error checking admin status:', e);
    }

    // Verifică permisiuni
    if (!isAdmin && chat.user_id !== authUser.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Obține mesajele
    const { data: messages, error: messagesError } = await client
      .from('report_chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[API Report Chat Messages] Get messages error:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages', details: messagesError.message },
        { status: 500 }
      );
    }

    // Marchează mesajele ca citite pentru utilizatorul curent
    if (messages && messages.length > 0) {
      await client
        .from('report_chat_messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_user_id', authUser.id)
        .eq('is_read', false);
    }

    return NextResponse.json({ success: true, messages: messages || [] });
  } catch (error: any) {
    console.error('[API Report Chat Messages] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const { chatId, messageText, isSystemMessage } = body;

    if (!chatId || !messageText) {
      return NextResponse.json({ error: 'chatId and messageText are required' }, { status: 400 });
    }

    const client = supabaseAdmin || supabase;

    // Verifică dacă utilizatorul are acces la această conversație
    const { data: chat, error: chatError } = await client
      .from('report_chats')
      .select('user_id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Verifică dacă este admin
    let isAdmin = false;
    try {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (profile && profile.is_admin === true) {
        isAdmin = true;
      }
    } catch (e) {
      console.error('[API Report Chat Messages] Error checking admin status:', e);
    }

    // Verifică permisiuni
    if (!isAdmin && chat.user_id !== authUser.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Creează mesajul
    const { data: message, error: insertError } = await client
      .from('report_chat_messages')
      .insert({
        chat_id: chatId,
        sender_user_id: isSystemMessage ? null : authUser.id,
        is_admin: isAdmin,
        is_system_message: isSystemMessage || false,
        message_text: messageText,
        is_read: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API Report Chat Messages] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to send message', details: insertError.message },
        { status: 500 }
      );
    }

    // Actualizează updated_at pentru chat
    await client
      .from('report_chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId);

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error('[API Report Chat Messages] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
