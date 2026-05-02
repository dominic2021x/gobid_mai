import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatId, messageText } = body;

    if (!chatId || !messageText) {
      return NextResponse.json({ error: 'chatId and messageText are required' }, { status: 400 });
    }

    // Verifică că utilizatorul este participant în chat
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('product_chats')
      .select('buyer_user_id, seller_user_id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chat.buyer_user_id !== authUser.user.id && chat.seller_user_id !== authUser.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Creează mesajul de sistem (sender_user_id este NULL, is_system_message este true)
    console.log('[API System Message] Attempting to insert system message:', {
      chatId,
      messageText: messageText.substring(0, 50) + '...',
      sender_user_id: null,
      is_system_message: true
    });

    const { data: message, error: messageError } = await supabaseAdmin
      .from('product_chat_messages')
      .insert({
        chat_id: chatId,
        sender_user_id: null, // NULL pentru mesaje de sistem
        message_text: messageText,
        is_system_message: true,
        is_read: false
      })
      .select()
      .single();

    if (messageError) {
      console.error('[API System Message] Insert error details:', {
        code: messageError.code,
        message: messageError.message,
        details: messageError.details,
        hint: messageError.hint,
        fullError: JSON.stringify(messageError)
      });
      return NextResponse.json({ 
        error: 'Failed to create system message',
        details: messageError.message || JSON.stringify(messageError)
      }, { status: 500 });
    }

    console.log('[API System Message] System message created successfully:', { messageId: message?.id });
    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error('[API System Message] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
