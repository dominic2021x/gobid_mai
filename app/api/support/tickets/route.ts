import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// GET - Obține toate tichetele pentru un utilizator
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userEmail = searchParams.get('userEmail');
    const userId = searchParams.get('userId');

    if (!userEmail && !userId) {
      return NextResponse.json(
        { error: 'userEmail sau userId este obligatoriu' },
        { status: 400 }
      );
    }

    console.log('[API] Fetching tickets for:', { userEmail, userId });

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Assign to const so TypeScript knows it's not null in closures
    const admin = supabaseAdmin;

    let query = admin
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { data: tickets, error } = await query;

    if (error) {
      console.error('[API] Error fetching tickets:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch tickets' },
        { status: 500 }
      );
    }

    // Pentru fiecare tichet, obține mesajele
    const ticketsWithMessages = await Promise.all(
      (tickets || []).map(async (ticket) => {
        const { data: ticketMessages, error: messagesError } = await admin
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticket.id)
          .order('timestamp', { ascending: true });

        if (messagesError) {
          console.error('[API] Error fetching messages for ticket:', ticket.id, messagesError);
        }

        return {
          ...ticket,
          messages: ticketMessages || [],
        };
      })
    );

    console.log(`[API] Successfully fetched ${ticketsWithMessages.length} tickets`);

    return NextResponse.json({
      success: true,
      tickets: ticketsWithMessages,
    });
  } catch (error: any) {
    console.error('[API] Error in GET tickets route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Creează un tichet nou
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      userId,
      userEmail,
      subject,
      category,
      priority,
      status = 'active',
      requestedBy,
      assignee = 'Echipa Suport',
      messages: initialMessages = [],
    } = body;

    if (!id || !userEmail || !subject || !category || !priority) {
      return NextResponse.json(
        { error: 'id, userEmail, subject, category și priority sunt obligatorii' },
        { status: 400 }
      );
    }

    console.log('[API] Creating ticket:', id);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Creează tichetul
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        id,
        user_id: userId || null,
        user_email: userEmail,
        subject,
        category,
        priority,
        status,
        requested_by: requestedBy || null,
        assignee,
      })
      .select()
      .single();

    if (ticketError) {
      const msg = ticketError.message || '';
      const isDuplicate =
        ticketError.code === '23505' ||
        /duplicate|unique constraint/i.test(msg);
      if (isDuplicate) {
        const { data: existing, error: fetchExistingError } = await supabaseAdmin
          .from('support_tickets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (existing && !fetchExistingError) {
          const { data: existingMessages } = await supabaseAdmin
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', id)
            .order('timestamp', { ascending: true });
          console.log('[API] Ticket already exists, returning existing:', id);
          return NextResponse.json({
            success: true,
            ticket: { ...existing, messages: existingMessages || [] },
          });
        }
      }
      console.error('[API] Error creating ticket:', ticketError);
      return NextResponse.json(
        { error: ticketError.message || 'Failed to create ticket' },
        { status: 500 }
      );
    }

    // Dacă există mesaje, le adaugă
    if (initialMessages && initialMessages.length > 0) {
      const messagesToInsert = initialMessages.map((msg: any, index: number) => ({
        ticket_id: id,
        sender: msg.sender || 'user',
        message: msg.message || msg.content || '',
        attachments: msg.attachments || [],
        timestamp: msg.timestamp || new Date().toISOString(),
      }));

      const { error: messagesError } = await supabaseAdmin
        .from('ticket_messages')
        .insert(messagesToInsert);

      if (messagesError) {
        console.error('[API] Error creating messages:', messagesError);
        // Nu returnăm eroare, tichetul a fost creat deja
      }
    }

    // Obține tichetul complet cu mesaje
    const { data: ticketMessages, error: fetchMessagesError } = await supabaseAdmin
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('timestamp', { ascending: true });

    const ticketWithMessages = {
      ...ticket,
      messages: ticketMessages || [],
    };

    console.log('[API] Successfully created ticket:', id);

    return NextResponse.json({
      success: true,
      ticket: ticketWithMessages,
    });
  } catch (error: any) {
    console.error('[API] Error in POST tickets route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Actualizează un tichet
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, assignee, ...otherFields } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id este obligatoriu' },
        { status: 400 }
      );
    }

    console.log('[API] Updating ticket:', id);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (assignee) updateData.assignee = assignee;
    if (otherFields.subject) updateData.subject = otherFields.subject;
    if (otherFields.category) updateData.category = otherFields.category;
    if (otherFields.priority) updateData.priority = otherFields.priority;

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API] Error updating ticket:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update ticket' },
        { status: 500 }
      );
    }

    // Obține mesajele
    const { data: ticketMessages } = await supabaseAdmin
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('timestamp', { ascending: true });

    const ticketWithMessages = {
      ...ticket,
      messages: ticketMessages || [],
    };

    console.log('[API] Successfully updated ticket:', id);

    return NextResponse.json({
      success: true,
      ticket: ticketWithMessages,
    });
  } catch (error: any) {
    console.error('[API] Error in PUT tickets route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

