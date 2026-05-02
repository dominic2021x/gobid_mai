import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;
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

    const body = await request.json();
    const { communication_preference } = body;

    if (!communication_preference || !['chat', 'offers_only'].includes(communication_preference)) {
      return NextResponse.json(
        { error: 'Invalid communication_preference. Must be "chat" or "offers_only"' },
        { status: 400 }
      );
    }

    // Verifică dacă chat-ul există și utilizatorul are acces
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('product_chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Verifică dacă utilizatorul este vânzătorul sau cumpărătorul
    if (chat.buyer_user_id !== authUser.user.id && chat.seller_user_id !== authUser.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Actualizează preferința de comunicare
    const { data: updatedChat, error: updateError } = await supabaseAdmin
      .from('product_chats')
      .update({ communication_preference })
      .eq('id', chatId)
      .select()
      .single();

    if (updateError) {
      console.error('[API Product Chat Preference] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update preference', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chat: updatedChat,
    });
  } catch (error: any) {
    console.error('[API Product Chat Preference] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}



