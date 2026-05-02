import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// GET - Obține TOATE tichetele (pentru admin)
// NOTĂ: Acest endpoint ar trebui să fie protejat cu autentificare admin
export async function GET(request: NextRequest) {
  try {
    console.log('[API] Admin fetching all tickets from Supabase...');

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Assign to const so TypeScript knows it's not null in closures
    const admin = supabaseAdmin;

    // Fetch all tickets (admin access)
    const { data: tickets, error } = await admin
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching all tickets:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch tickets' },
        { status: 500 }
      );
    }

    // Pentru fiecare tichet, obține mesajele
    const ticketsWithMessages = await Promise.all(
      (tickets || []).map(async (ticket) => {
        const { data: messages, error: messagesError } = await admin
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticket.id)
          .order('timestamp', { ascending: true });

        if (messagesError) {
          console.error('[API] Error fetching messages for ticket:', ticket.id, messagesError);
        }

        return {
          ...ticket,
          messages: messages || [],
        };
      })
    );

    console.log(`[API] Successfully fetched ${ticketsWithMessages.length} tickets for admin`);

    return NextResponse.json({
      success: true,
      tickets: ticketsWithMessages,
    });
  } catch (error: any) {
    console.error('[API] Error in GET all tickets route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}




