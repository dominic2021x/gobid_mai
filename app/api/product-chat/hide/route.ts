import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      console.error('[hide-chat] Supabase admin client not configured');
      return NextResponse.json(
        { error: 'Configurare server invalidă' },
        { status: 500 }
      );
    }

    const { chatId, userId } = await request.json();

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: 'chatId și userId sunt obligatorii' },
        { status: 400 }
      );
    }

    // Obține conversația actuală
    const { data: chat, error: fetchError } = await supabaseAdmin
      .from('product_chats')
      .select('hidden_by_user_ids, buyer_user_id, seller_user_id')
      .eq('id', chatId)
      .single();

    if (fetchError || !chat) {
      console.error('[hide-chat] Error fetching chat:', fetchError);
      return NextResponse.json(
        { error: 'Conversația nu a fost găsită' },
        { status: 404 }
      );
    }

    // Verifică dacă utilizatorul face parte din conversație
    if (chat.buyer_user_id !== userId && chat.seller_user_id !== userId) {
      return NextResponse.json(
        { error: 'Nu ai permisiunea de a ascunde această conversație' },
        { status: 403 }
      );
    }

    // Adaugă userId la lista de utilizatori care au ascuns conversația
    const currentHiddenIds = chat.hidden_by_user_ids || [];
    const updatedHiddenIds = currentHiddenIds.includes(userId)
      ? currentHiddenIds
      : [...currentHiddenIds, userId];

    // Actualizează conversația
    const { error: updateError } = await supabaseAdmin
      .from('product_chats')
      .update({ hidden_by_user_ids: updatedHiddenIds })
      .eq('id', chatId);

    if (updateError) {
      console.error('[hide-chat] Error updating chat:', updateError);
      return NextResponse.json(
        { error: 'Eroare la ascunderea conversației' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[hide-chat] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Eroare necunoscută' },
      { status: 500 }
    );
  }
}
