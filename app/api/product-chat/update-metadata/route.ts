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
    const { chatId, metadata } = body;

    if (!chatId || !metadata) {
      return NextResponse.json({ error: 'chatId and metadata are required' }, { status: 400 });
    }

    console.log('[API Update Metadata] Request received:', { 
      chatId, 
      userId: authUser.user.id,
      metadata 
    });

    // Verifică că utilizatorul este participant în chat
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('product_chats')
      .select('buyer_user_id, seller_user_id, metadata')
      .eq('id', chatId)
      .single();

    if (chatError) {
      console.error('[API Update Metadata] Chat query error:', chatError);
      return NextResponse.json({ 
        error: 'Chat not found', 
        details: chatError.message || JSON.stringify(chatError) 
      }, { status: 404 });
    }

    if (!chat) {
      console.error('[API Update Metadata] Chat not found in database:', { chatId });
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    console.log('[API Update Metadata] Chat found:', { 
      chatId, 
      buyer_user_id: chat.buyer_user_id,
      seller_user_id: chat.seller_user_id,
      current_user_id: authUser.user.id
    });

    if (chat.buyer_user_id !== authUser.user.id && chat.seller_user_id !== authUser.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Mergează metadata existentă cu cea nouă
    const existingMetadata = chat.metadata || {};
    const updatedMetadata = { ...existingMetadata, ...metadata };

    // Actualizează metadata
    const { error: updateError } = await supabaseAdmin
      .from('product_chats')
      .update({ metadata: updatedMetadata })
      .eq('id', chatId);

    if (updateError) {
      console.error('[API Update Metadata] Error:', updateError);
      return NextResponse.json({ error: 'Failed to update metadata' }, { status: 500 });
    }

    return NextResponse.json({ success: true, metadata: updatedMetadata });
  } catch (error: any) {
    console.error('[API Update Metadata] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
