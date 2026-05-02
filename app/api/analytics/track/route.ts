/**
 * API Route - Track Analytics Event
 * POST /api/analytics/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      type,
      item_id,
      item_type,
      metadata = {},
      user_id,
      session_id,
    } = body;

    // Validare
    if (!type || !item_id) {
      return NextResponse.json(
        { error: 'type și item_id sunt obligatorii' },
        { status: 400 }
      );
    }

    // Use supabaseAdmin to bypass RLS (Row Level Security) on server-side
    if (!supabaseAdmin) {
      console.error('supabaseAdmin is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Salvează în Supabase
    const { data, error } = await supabaseAdmin
      .from('analytics')
      .insert([
        {
          type,
          item_id,
          item_type: item_type || null,
          metadata,
          user_id: user_id || null,
          session_id: session_id || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error inserting analytics event:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/analytics/track:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to track event' },
      { status: 500 }
    );
  }
}


