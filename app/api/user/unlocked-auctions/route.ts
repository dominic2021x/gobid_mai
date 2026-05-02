import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține unlocked auctions pentru user-ul curent
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

    const { data: unlocked, error: unlockedError } = await admin
      .from('user_unlocked_auctions')
      .select('auction_id')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (unlockedError) {
      console.error('Failed to fetch unlocked auctions:', unlockedError);
      return NextResponse.json({ error: 'Cannot read unlocked auctions' }, { status: 500 });
    }

    return NextResponse.json(unlocked?.map(u => u.auction_id) || []);
  } catch (error) {
    console.error('Unexpected error fetching unlocked auctions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă unlocked auction
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
    const { auctionId } = body;

    if (!auctionId) {
      return NextResponse.json({ error: 'Missing auctionId' }, { status: 400 });
    }

    const { data: unlocked, error: insertError } = await admin
      .from('user_unlocked_auctions')
      .upsert({
        user_id: userId,
        user_email: userEmail,
        auction_id: auctionId
      }, { onConflict: 'user_id,auction_id' })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to add unlocked auction:', insertError);
      return NextResponse.json({ error: 'Cannot add unlocked auction' }, { status: 500 });
    }

    return NextResponse.json(unlocked);
  } catch (error) {
    console.error('Unexpected error adding unlocked auction:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



