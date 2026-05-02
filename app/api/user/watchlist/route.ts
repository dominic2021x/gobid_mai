import { NextRequest, NextResponse } from 'next/server';
import { getBearerOrCookieAuthUser } from '@/lib/auth/getRequestAuthUser';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține watchlist pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;

    const { data: watchlist, error: watchlistError } = await admin
      .from('user_watchlist')
      .select('product_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (watchlistError) {
      console.error('Failed to fetch watchlist:', watchlistError);
      return NextResponse.json({ error: 'Cannot read watchlist' }, { status: 500 });
    }

    return NextResponse.json(watchlist || []);
  } catch (error) {
    console.error('Unexpected error fetching watchlist:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă în watchlist
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const userEmail = authUser.email || '';
    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    const { data: watchlistItem, error: insertError } = await admin
      .from('user_watchlist')
      .upsert({
        user_id: userId,
        user_email: userEmail,
        product_id: productId
      }, { onConflict: 'user_id,product_id' })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to add watchlist item:', insertError);
      return NextResponse.json({ error: 'Cannot add watchlist item' }, { status: 500 });
    }

    return NextResponse.json(watchlistItem);
  } catch (error) {
    console.error('Unexpected error adding watchlist item:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Șterge din watchlist
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    const { error: deleteError } = await admin
      .from('user_watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    if (deleteError) {
      console.error('Failed to delete watchlist item:', deleteError);
      return NextResponse.json({ error: 'Cannot delete watchlist item' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting watchlist item:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



