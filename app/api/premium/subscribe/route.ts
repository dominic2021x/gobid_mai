/**
 * API Route pentru activarea abonamentului premium la nivel de utilizator
 * Toate produsele utilizatorului vor fi promovate automat când are premium activ
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
    const { weeks, amount } = body;

    if (!weeks || !amount) {
      return NextResponse.json(
        { error: 'Lipsesc parametrii necesari (weeks, amount)' },
        { status: 400 }
      );
    }

    // Calculează data de expirare (săptămâni în viitor)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (weeks * 7));

    // Verifică dacă utilizatorul are deja premium activ și extinde perioada dacă da
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('premium_until')
      .eq('user_id', user.id)
      .maybeSingle();

    let finalExpirationDate = expirationDate;
    
    // Dacă utilizatorul are deja premium activ, adaugă săptămânile la data existentă
    if (existingProfile?.premium_until) {
      const existingDate = new Date(existingProfile.premium_until);
      if (existingDate > new Date()) {
        // Extinde abonamentul existent
        finalExpirationDate = new Date(existingDate);
        finalExpirationDate.setDate(finalExpirationDate.getDate() + (weeks * 7));
      }
    }

    // Actualizează profilul utilizatorului cu informații premium
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        premium_until: finalExpirationDate.toISOString(),
        is_premium: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating user profile with premium:', updateError);
      return NextResponse.json(
        { error: 'Eroare la actualizarea profilului' },
        { status: 500 }
      );
    }

    // Actualizează TOATE produsele active ale utilizatorului să fie premium
    const { error: productsUpdateError } = await supabaseAdmin
      .from('products')
      .update({
        is_premium: true,
        premium_until: finalExpirationDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (productsUpdateError) {
      console.error('Error updating products with premium:', productsUpdateError);
      // Nu returnăm eroare aici, deoarece abonamentul a fost activat cu succes
    }

    // Creează înregistrare de plată (pentru istoric)
    const { error: paymentError } = await supabaseAdmin
      .from('user_payments')
      .insert({
        user_id: user.id,
        amount: amount,
        currency: 'RON',
        payment_type: 'premium_subscription',
        description: `Abonament premium - ${weeks} ${weeks === 1 ? 'săptămână' : 'săptămâni'}`,
        metadata: {
          weeks: weeks,
          expiration_date: finalExpirationDate.toISOString(),
          all_products_promoted: true,
        },
      });

    if (paymentError) {
      console.error('Error creating payment record:', paymentError);
      // Nu returnăm eroare aici, deoarece abonamentul a fost activat cu succes
    }

    return NextResponse.json({
      success: true,
      message: `Abonament premium activat cu succes pentru ${weeks} ${weeks === 1 ? 'săptămână' : 'săptămâni'}. Toate anunțurile tale vor fi promovate automat!`,
      premium_until: finalExpirationDate.toISOString(),
    });
  } catch (error: any) {
    console.error('Error in premium subscription API:', error);
    return NextResponse.json(
      {
        error: 'Eroare la procesarea abonamentului premium',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
