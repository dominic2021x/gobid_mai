/**
 * API Route pentru activarea promovării premium pentru un produs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Token de autentificare lipsă' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { product_id, amount, weeks } = body;

    if (!product_id || !amount || !weeks) {
      return NextResponse.json(
        { error: 'Lipsesc parametrii necesari (product_id, amount, weeks)' },
        { status: 400 }
      );
    }

    // Validate weeks (should be a positive number)
    const weeksNum = Number(weeks);
    if (isNaN(weeksNum) || weeksNum < 1 || weeksNum > 52) {
      return NextResponse.json(
        { error: 'Numărul de săptămâni trebuie să fie între 1 și 52' },
        { status: 400 }
      );
    }

    // Verifică că produsul aparține utilizatorului
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, user_id, title')
      .eq('id', product_id)
      .eq('user_id', user.id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Produsul nu a fost găsit sau nu îți aparține' },
        { status: 404 }
      );
    }

    // Calculează data de expirare (săptămâni în viitor)
    const now = new Date();
    const premiumUntil = new Date(now.getTime() + weeksNum * 7 * 24 * 60 * 60 * 1000);

    // Actualizează produsul cu informații premium
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        premium_until: premiumUntil.toISOString(),
        is_premium: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', product_id);

    if (updateError) {
      console.error('Error updating product with premium:', updateError);
      return NextResponse.json(
        { error: 'Eroare la actualizarea produsului' },
        { status: 500 }
      );
    }

    // Creează înregistrare de plată (pentru istoric)
    const { error: paymentError } = await supabaseAdmin
      .from('user_payments')
      .insert({
        user_id: user.id,
        amount: amount,
        currency: 'RON',
        payment_type: 'premium_promotion',
        description: `Promovare premium pentru "${product.title}" - ${weeksNum} ${weeksNum === 1 ? 'săptămână' : 'săptămâni'}`,
        metadata: {
          product_id: product_id,
          weeks: weeksNum,
          premium_until: premiumUntil.toISOString(),
        },
      });

    if (paymentError) {
      console.error('Error creating payment record:', paymentError);
      // Nu returnăm eroare aici, deoarece promovarea a fost activată cu succes
    }

    return NextResponse.json({
      success: true,
      message: `Promovare premium activată cu succes pentru acest anunț!`,
    });
  } catch (error: any) {
    console.error('Error in premium promotion API:', error);
    return NextResponse.json(
      {
        error: 'Eroare la procesarea promovării premium',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
