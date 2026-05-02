import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// POST - Adaugă un mesaj nou la un tichet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ticketId,
      sender,
      message,
      attachments = [],
      timestamp,
    } = body;

    if (!ticketId || !sender || !message) {
      return NextResponse.json(
        { error: 'ticketId, sender și message sunt obligatorii' },
        { status: 400 }
      );
    }

    console.log('[API] Adding message to ticket:', ticketId);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Verifică dacă tichetul există
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error('[API] Error looking up ticket:', ticketError);
      return NextResponse.json(
        { error: ticketError.message || 'Eroare la verificarea tichetului' },
        { status: 500 }
      );
    }

    if (!ticket) {
      return NextResponse.json(
        { error: 'Tichetul nu există' },
        { status: 404 }
      );
    }

    // Adaugă mesajul
    const { data: newMessage, error: messageError } = await supabaseAdmin
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
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

    // Actualizează statusul tichetului dacă este mesaj de la user
    if (sender === 'user') {
      await supabaseAdmin
        .from('support_tickets')
        .update({ 
          status: 'In asteptare raspuns',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);
    } else if (sender === 'admin') {
      await supabaseAdmin
        .from('support_tickets')
        .update({ 
          status: 'Am raspuns',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);
    }

    console.log('[API] Successfully added message to ticket:', ticketId);

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error('[API] Error in POST messages route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Obține mesajele pentru un tichet
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticketId = searchParams.get('ticketId');

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId este obligatoriu' },
        { status: 400 }
      );
    }

    console.log('[API] Fetching messages for ticket:', ticketId);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { data: messages, error } = await supabaseAdmin
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
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
    console.error('[API] Error in GET messages route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}




