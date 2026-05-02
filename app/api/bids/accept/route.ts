/**
 * API Route - Accept Bid
 * POST /api/bids/accept - Acceptă o ofertă pentru un produs
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { sendUserPushNotification } from '@/lib/push/sendUserPushNotification';
import { formatPrice } from '@/lib/currency';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, bid_id, cancel } = body;

    // Validare - dacă este anulare, nu avem nevoie de bid_id
    if (!product_id || (!bid_id && !cancel)) {
      return NextResponse.json(
        { error: 'product_id și bid_id sunt obligatorii' },
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
      console.error('supabaseAdmin is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Verifică dacă produsul există și dacă utilizatorul este proprietarul
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

    // Verifică dacă utilizatorul este proprietarul produsului
    if (product.user_id !== userId) {
      return NextResponse.json(
        { error: 'Nu ai permisiunea să accepți oferte pentru acest produs' },
        { status: 403 }
      );
    }

    // Dacă este anulare, resetează toate ofertele și statusul produsului
    if (cancel) {
      // Resetează toate ofertele
      await supabaseAdmin
        .from('bids')
        .update({ is_winning: false, is_outbid: false })
        .eq('product_id', product_id);
      
      // Resetează statusul produsului înapoi la 'active' (live)
      await supabaseAdmin
        .from('products')
        .update({ status: 'active' })
        .eq('id', product_id);
      
      console.log('[Bid Accept Cancel] Product status reset to active for product:', product_id);
      
      return NextResponse.json(
        { 
          success: true, 
          message: 'Acceptarea ofertei a fost anulată. Produsul este din nou live.' 
        },
        { status: 200 }
      );
    }

    // Verifică dacă oferta există
    const { data: bid, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('id, product_id, amount, is_winning, user_id')
      .eq('id', bid_id)
      .eq('product_id', product_id)
      .single();

    if (bidError || !bid) {
      return NextResponse.json(
        { error: 'Oferta nu a fost găsită' },
        { status: 404 }
      );
    }

    // Marchează toate ofertele ca fiind outbid
    await supabaseAdmin
      .from('bids')
      .update({ is_outbid: true, is_winning: false })
      .eq('product_id', product_id);

    // Marchează oferta acceptată ca fiind câștigătoare (PERMANENT în Supabase)
    const { data: updatedBid, error: updateError } = await supabaseAdmin
      .from('bids')
      .update({ is_winning: true, is_outbid: false })
      .eq('id', bid_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error accepting bid:', updateError);
      return NextResponse.json(
        { error: 'Eroare la acceptarea ofertei' },
        { status: 500 }
      );
    }

    // Creează sau verifică tranzacția în product_transactions
    // (Trigger-ul ar trebui să o creeze automat, dar o creăm manual pentru siguranță)
    try {
      const { data: existingTransaction, error: checkError } = await supabaseAdmin
        .from('product_transactions')
        .select('id')
        .eq('product_id', product_id)
        .eq('buyer_id', bid.user_id)
        .eq('seller_id', product.user_id)
        .eq('status', 'completed')
        .maybeSingle();

      if (!existingTransaction) {
        // Creează tranzacția dacă nu există
        const { data: newTransaction, error: transactionError } = await supabaseAdmin
          .from('product_transactions')
          .insert({
            product_id: product_id,
            buyer_id: bid.user_id,
            seller_id: product.user_id,
            bid_id: bid_id,
            amount: bid.amount,
            currency: 'RON', // Poți obține currency din product dacă este disponibil
            status: 'completed'
          })
          .select()
          .single();

        if (transactionError) {
          console.error('[Bid Accept] Error creating transaction:', transactionError);
          // Nu întrerupem procesul dacă tranzacția nu poate fi creată, dar logăm eroarea
        } else {
          console.log('[Bid Accept] Transaction created successfully:', newTransaction?.id);
        }
      } else {
        console.log('[Bid Accept] Transaction already exists:', existingTransaction.id);
      }
    } catch (transactionCreateError) {
      console.error('[Bid Accept] Error in transaction creation process:', transactionCreateError);
      // Nu întrerupem procesul dacă tranzacția nu poate fi creată
    }

    // Actualizează prețul produsului cu oferta acceptată și marchează produsul ca rezervat
    await supabaseAdmin
      .from('products')
      .update({ 
        starting_price_ron: bid.amount,
        starting_price: bid.amount,
        status: 'reserved' // Marchează produsul ca rezervat când se acceptă o ofertă
      })
      .eq('id', product_id);

    // Creează notificare pentru cumpărător (utilizatorul care a făcut oferta)
    try {
      const { data: productData } = await supabaseAdmin
        .from('products')
        .select('title, slug')
        .eq('id', product_id)
        .single();

      const productTitle = productData?.title || 'Produs';
      const productSlug = productData?.slug || product_id;

      // Creează notificare în tabelul user_notifications
      if (updatedBid.user_id) {
        const { error: notificationError } = await supabaseAdmin
          .from('user_notifications')
          .insert({
            user_id: updatedBid.user_id,
            title: 'Oferta ta a fost acceptată! 🎉',
            message: `Oferta ta de ${formatPrice(bid.amount, 'RON')} pentru "${productTitle}" a fost acceptată de vânzător.`,
            type: 'success',
            metadata: {
              productId: product_id,
              productSlug: productSlug,
              bidId: bid_id,
              amount: bid.amount,
              productTitle: productTitle,
            },
          });

        if (notificationError) {
          console.error('[Bid Accept] Error creating notification:', notificationError);
        } else {
          console.log('[Bid Accept] Notification created for buyer:', updatedBid.user_id);
          await sendUserPushNotification({
            userId: updatedBid.user_id,
            title: 'Oferta ta a fost acceptată! 🎉',
            body: `Oferta ta pentru "${productTitle}" a fost acceptată.`,
            data: {
              type: 'bid_accepted',
              product_id: String(product_id),
            },
          });
        }
      }
    } catch (notificationError) {
      console.error('[Bid Accept] Error creating notification:', notificationError);
      // Nu întrerupem procesul dacă notificarea eșuează
    }

    return NextResponse.json(
      { 
        success: true, 
        bid: updatedBid,
        message: 'Oferta a fost acceptată cu succes!' 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/bids/accept:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to accept bid' },
      { status: 500 }
    );
  }
}
