/**
 * GET    /api/support/messages/[messageId] - citește un mesaj
 * PATCH  /api/support/messages/[messageId] - actualizează un mesaj
 * DELETE /api/support/messages/[messageId] - șterge un mesaj
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ messageId: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { messageId } = await context.params;
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { data: message, error } = await supabaseAdmin
      .from('ticket_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (error || !message) {
      return NextResponse.json(
        { error: error?.message || 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error('[support/messages/[messageId]] GET', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { messageId } = await context.params;
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.message === 'string') updates.message = body.message;
    if (Array.isArray(body.attachments)) updates.attachments = body.attachments;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: message, error } = await supabaseAdmin
      .from('ticket_messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error('[support/messages/[messageId]] PATCH', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { messageId } = await context.params;
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { error } = await supabaseAdmin
      .from('ticket_messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[support/messages/[messageId]] DELETE', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
