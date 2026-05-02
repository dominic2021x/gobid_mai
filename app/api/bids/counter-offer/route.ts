/**
 * API Route - Counter Offer
 * POST /api/bids/counter-offer - Trimite o contraoferta pentru o ofertă existentă
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendUserPushNotification } from '@/lib/push/sendUserPushNotification';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, bid_id, counter_amount } = body;

    // Validare
    if (!product_id || !bid_id || !counter_amount) {
      return NextResponse.json(
        { error: 'product_id, bid_id și counter_amount sunt obligatorii' },
        { status: 400 }
      );
    }

    if (counter_amount <= 0) {
      return NextResponse.json(
        { error: 'Suma contraofertei trebuie să fie mai mare decât 0' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      console.error('supabaseAdmin is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Verifică dacă produsul există
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, user_id, starting_price_ron, starting_price_eur')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Produsul nu a fost găsit' },
        { status: 404 }
      );
    }

    // Verifică dacă oferta există
    const { data: originalBid, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('id, product_id, amount, user_id')
      .eq('id', bid_id)
      .eq('product_id', product_id)
      .single();

    if (bidError || !originalBid) {
      return NextResponse.json(
        { error: 'Oferta nu a fost găsită' },
        { status: 404 }
      );
    }

    // Validare: Contraoferta minimă trebuie să fie cel puțin 33% din prețul anunțului
    // Folosim starting_price_ron sau starting_price_eur în funcție de moneda produsului
    // Pentru simplitate, folosim Lei (poate fi extins pentru EUR)
    const startingPrice = product.starting_price_ron || 0;
    const minimumBidAmount = Math.ceil(startingPrice * 0.33); // 33% din preț, rotunjit în sus
    
    if (startingPrice > 0) {
      if (counter_amount < minimumBidAmount) {
        return NextResponse.json(
          { 
            error: `Contraoferta minimă este ${minimumBidAmount} Lei (33% din prețul anunțului de ${startingPrice} Lei)`,
            minimumBidAmount: minimumBidAmount,
            startingPrice: startingPrice
          },
          { status: 400 }
        );
      }
    }

    // Creează o nouă ofertă (contraoferta) de la executor către licitator
    // Notă: Aceasta este o ofertă nouă, nu o modificare a celei existente
    const { data: newBid, error: createBidError } = await supabaseAdmin
      .from('bids')
      .insert([
        {
          product_id,
          user_id: product.user_id, // Executorul (proprietarul produsului)
          amount: counter_amount,
          is_winning: false, // Nu este câștigătoare automat
          is_outbid: false,
        },
      ])
      .select()
      .single();

    if (createBidError) {
      console.error('Error creating counter offer:', createBidError);
      return NextResponse.json(
        { error: 'Eroare la crearea contraofertei' },
        { status: 500 }
      );
    }

    // Creează notificare pentru licitator (utilizatorul care a făcut oferta originală)
    try {
      console.log('[API Counter Offer] Creating notification for user:', originalBid.user_id);
      
      // Obține numele executorului (vânzătorul)
      const { data: sellerProfile, error: sellerProfileError } = await supabaseAdmin
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('user_id', product.user_id)
        .maybeSingle();

      if (sellerProfileError) {
        console.error('[API Counter Offer] Error fetching seller profile:', sellerProfileError);
      }

      const sellerName = sellerProfile 
        ? `${sellerProfile.first_name || ''} ${sellerProfile.last_name || ''}`.trim() || 'Vânzător'
        : 'Vânzător';

      // Obține informații despre produs
      const { data: productInfo, error: productInfoError } = await supabaseAdmin
        .from('products')
        .select('title, slug')
        .eq('id', product_id)
        .maybeSingle();

      if (productInfoError) {
        console.error('[API Counter Offer] Error fetching product info:', productInfoError);
      }

      const productTitle = productInfo?.title || 'Produs';
      const productSlug = productInfo?.slug || '';

      // Creează notificarea pentru licitator
      const notificationMessage = `${sellerName} v-a trimis o contraofertă de ${counter_amount} Lei pentru "${productTitle}"`;
      
      console.log('[API Counter Offer] Inserting notification:', {
        user_id: originalBid.user_id,
        message: notificationMessage,
        type: 'info'
      });
      
      const { data: notification, error: notificationError } = await supabaseAdmin
        .from('user_notifications')
        .insert({
          user_id: originalBid.user_id, // Licitatorul care a primit contraoferta
          title: 'Contraofertă nouă',
          message: notificationMessage,
          type: 'info',
          metadata: {
            type: 'counter_offer',
            product_id: product_id,
            product_slug: productSlug,
            bid_id: newBid.id,
            original_bid_id: bid_id,
            amount: counter_amount,
            seller_id: product.user_id
          }
        })
        .select()
        .single();

      if (notificationError) {
        console.error('[API Counter Offer] Error inserting notification:', notificationError);
        console.error('[API Counter Offer] Notification error details:', {
          code: notificationError.code,
          message: notificationError.message,
          details: notificationError.details,
          hint: notificationError.hint
        });
      } else {
        console.log('[API Counter Offer] Notification created successfully:', notification.id);
        await sendUserPushNotification({
          userId: originalBid.user_id,
          title: 'Contraofertă nouă',
          body: notificationMessage,
          data: {
            type: 'counter_offer',
            product_id: String(product_id),
          },
        });
      }
    } catch (notificationError) {
      console.error('[API Counter Offer] Exception creating notification:', notificationError);
      // Nu returnăm eroare dacă notificarea eșuează
    }

    return NextResponse.json(
      { 
        success: true,
        bid: newBid,
        message: 'Contraoferta a fost trimisă cu succes!' 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/bids/counter-offer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create counter offer' },
      { status: 500 }
    );
  }
}
