import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// POST - Adaugă un mesaj nou la o conversație de chat AI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      conversationId,
      sender,
      message,
      attachments = [],
      timestamp,
    } = body;

    if (!conversationId || !sender || !message) {
      return NextResponse.json(
        { error: 'conversationId, sender și message sunt obligatorii' },
        { status: 400 }
      );
    }

    console.log('[API] Adding message to conversation:', conversationId);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Verifică dacă conversația există
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('support_chat_conversations')
      .select('id')
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'Conversația nu există' },
        { status: 404 }
      );
    }

    // Adaugă mesajul
    const { data: newMessage, error: messageError } = await supabaseAdmin
      .from('support_chat_messages')
      .insert({
        conversation_id: conversationId,
        sender,
        message,
        attachments,
        timestamp: timestamp || new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      console.error('[API] Error adding message:', messageError);
      return NextResponse.json(
        { error: messageError.message || 'Failed to add message' },
        { status: 500 }
      );
    }

    // Actualizează updated_at pentru conversație
    await supabaseAdmin
      .from('support_chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log('[API] Successfully added message to conversation:', conversationId);

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error('[API] Error in POST chat messages route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Obține mesajele pentru o conversație
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId este obligatoriu' },
        { status: 400 }
      );
    }

    console.log('[API] Fetching messages for conversation:', conversationId);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { data: messages, error } = await supabaseAdmin
      .from('support_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('[API] Error fetching messages:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    console.log(`[API] Successfully fetched ${messages?.length || 0} messages`);

    return NextResponse.json({
      success: true,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('[API] Error in GET chat messages route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}




