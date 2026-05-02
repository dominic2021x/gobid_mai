import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  console.log('[hide-report-chat] API endpoint called');
  try {
    if (!supabaseAdmin) {
      console.error('[hide-report-chat] Supabase admin client not configured');
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
      .from('report_chats')
      .select('hidden_by_user_ids, user_id, reported_user_id')
      .eq('id', chatId)
      .single();

    if (fetchError || !chat) {
      console.error('[hide-report-chat] Error fetching chat:', fetchError);
      return NextResponse.json(
        { error: 'Conversația nu a fost găsită' },
        { status: 404 }
      );
    }

    // Verifică dacă utilizatorul face parte din conversație (fie reporter, fie raportat)
    if (chat.user_id !== userId && chat.reported_user_id !== userId) {
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
      .from('report_chats')
      .update({ hidden_by_user_ids: updatedHiddenIds })
      .eq('id', chatId);

    if (updateError) {
      console.error('[hide-report-chat] Error updating chat:', updateError);
      return NextResponse.json(
        { error: 'Eroare la ascunderea conversației' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[hide-report-chat] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Eroare necunoscută' },
      { status: 500 }
    );
  }
}
