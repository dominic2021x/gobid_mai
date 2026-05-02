/**
 * POST /api/support/tickets/sync-messages
 * Sincronizează mesajele unui tichet cu lista trimisă (replace all).
 * Body: { ticketId, messages } — messages: [{ sender, message, timestamp?, attachments? }]
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, messages } = body;

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages must be an array' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('ticket_messages')
      .delete()
      .eq('ticket_id', ticketId);

    if (deleteError) {
      console.error('[sync-messages] Delete error:', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to clear messages' },
        { status: 500 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json({ success: true, synced: 0 });
    }

    const rows = messages.map((msg: { sender?: string; message?: string; timestamp?: string; attachments?: unknown[] }) => ({
      ticket_id: ticketId,
      sender: msg.sender ?? 'user',
      message: msg.message ?? '',
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      timestamp: msg.timestamp || new Date().toISOString(),
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('ticket_messages')
      .insert(rows)
      .select('id');

    if (insertError) {
      console.error('[sync-messages] Insert error:', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to sync messages' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synced: inserted?.length ?? rows.length,
    });
  } catch (err) {
    console.error('[support/tickets/sync-messages]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
