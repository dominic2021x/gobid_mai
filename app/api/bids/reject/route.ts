/**
 * API Route - Reject Bid
 * POST /api/bids/reject - Marchează o ofertă ca refuzată
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bid_id, product_id } = body;

    // Validare
    if (!bid_id || !product_id) {
      return NextResponse.json(
        { error: 'bid_id și product_id sunt obligatorii' },
        { status: 400 }
      );
    }

    const authUser = await getRequestAuthUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Neautorizat. Te rugăm să te autentifici.' },
        { status: 401 }
      );
    }
    const userId = authUser.id;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Verifică dacă oferta există
    const { data: bid, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('id, product_id, user_id')
      .eq('id', bid_id)
      .eq('product_id', product_id)
      .single();

    if (bidError || !bid) {
      return NextResponse.json(
        { error: 'Oferta nu a fost găsită' },
        { status: 404 }
      );
    }

    // Verifică dacă produsul există și obține proprietarul
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, user_id')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Produsul nu a fost găsit' },
        { status: 404 }
      );
    }

    // Verifică dacă utilizatorul are dreptul să refuze oferta
    // Doar proprietarul produsului sau proprietarul ofertei pot refuza
    const isProductOwner = product.user_id === userId;
    const isBidOwner = bid.user_id === userId;

    if (!isProductOwner && !isBidOwner) {
      return NextResponse.json(
        { error: 'Nu ai permisiunea să refuzi această ofertă' },
        { status: 403 }
      );
    }

    // Marchează oferta ca refuzată
    const { data: updatedBid, error: updateError } = await supabaseAdmin
      .from('bids')
      .update({ is_outbid: true, is_winning: false })
      .eq('id', bid_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error rejecting bid:', updateError);
      return NextResponse.json(
        { error: 'Eroare la refuzarea ofertei' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: true,
        bid: updatedBid,
        message: 'Oferta a fost refuzată cu succes!' 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/bids/reject:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject bid' },
      { status: 500 }
    );
  }
}
