import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține auction notifications pentru user-ul curent
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

    const { data: notifications, error: notificationsError } = await admin
      .from('user_auction_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (notificationsError) {
      console.error('Failed to fetch auction notifications:', notificationsError);
      return NextResponse.json({ error: 'Cannot read auction notifications' }, { status: 500 });
    }

    // Convert to object format { auctionId: { enabled, timeBefore } }
    const notificationsObj: Record<string, { enabled: boolean; timeBefore?: string }> = {};
    notifications?.forEach(notif => {
      notificationsObj[notif.auction_id] = {
        enabled: notif.enabled,
        timeBefore: notif.time_before || undefined
      };
    });

    return NextResponse.json(notificationsObj);
  } catch (error) {
    console.error('Unexpected error fetching auction notifications:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă sau actualizează auction notification
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
    const { auctionId, enabled, timeBefore } = body;

    if (!auctionId) {
      return NextResponse.json({ error: 'Missing auctionId' }, { status: 400 });
    }

    const { data: notification, error: upsertError } = await admin
      .from('user_auction_notifications')
      .upsert({
        user_id: userId,
        user_email: userEmail,
        auction_id: auctionId,
        enabled: enabled !== undefined ? enabled : true,
        time_before: timeBefore || null
      }, { onConflict: 'user_id,auction_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Failed to update auction notification:', upsertError);
      return NextResponse.json({ error: 'Cannot update auction notification' }, { status: 500 });
    }

    return NextResponse.json(notification);
  } catch (error) {
    console.error('Unexpected error updating auction notification:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Șterge auction notification
export async function DELETE(request: NextRequest) {
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
    const auctionId = searchParams.get('auctionId');

    if (!auctionId) {
      return NextResponse.json({ error: 'Missing auctionId' }, { status: 400 });
    }

    const { error: deleteError } = await admin
      .from('user_auction_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('auction_id', auctionId);

    if (deleteError) {
      console.error('Failed to delete auction notification:', deleteError);
      return NextResponse.json({ error: 'Cannot delete auction notification' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting auction notification:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



