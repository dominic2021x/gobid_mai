import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține auction history pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const { data: authUser, error: authError } = await admin.auth.getUser(accessToken);
    
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const userId = authUser.user.id;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const { data: history, error: historyError } = await admin
      .from('user_auction_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (historyError) {
      console.error('Failed to fetch auction history:', historyError);
      return NextResponse.json({ error: 'Cannot read auction history' }, { status: 500 });
    }

    return NextResponse.json(history || []);
  } catch (error) {
    console.error('Unexpected error fetching auction history:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă auction history entry
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const { data: authUser, error: authError } = await admin.auth.getUser(accessToken);
    
    if (authError || !authUser?.user) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const userId = authUser.user.id;
    const userEmail = authUser.user.email || '';
    const body = await request.json();
    const { auctionId, action, details } = body;

    if (!auctionId || !action) {
      return NextResponse.json({ error: 'Missing auctionId or action' }, { status: 400 });
    }

    const { data: historyEntry, error: insertError } = await admin
      .from('user_auction_history')
      .insert({
        user_id: userId,
        user_email: userEmail,
        auction_id: auctionId,
        action,
        details: details || {}
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to add auction history:', insertError);
      return NextResponse.json({ error: 'Cannot add auction history' }, { status: 500 });
    }

    return NextResponse.json(historyEntry);
  } catch (error) {
    console.error('Unexpected error adding auction history:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



