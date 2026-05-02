/**
 * API Route - User Reviews
 * GET /api/reviews - Obține review-urile pentru un utilizator sau produs
 * POST /api/reviews - Creează un review nou
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * GET /api/reviews
 * Obține review-urile pentru un utilizator sau produs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const productId = searchParams.get('productId');
    const reviewType = searchParams.get('reviewType'); // 'seller' sau 'buyer'

    if (!userId && !productId) {
      return NextResponse.json(
        { error: 'userId sau productId este obligatoriu' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Query simplificat pentru a evita problemele cu join-urile
    let query = supabaseAdmin
      .from('user_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('reviewed_user_id', userId);
    }

    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (reviewType) {
      query = query.eq('review_type', reviewType);
    }

    const { data: reviews, error } = await query;

    if (error) {
      console.error('[API] Error fetching reviews:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch reviews' },
        { status: 500 }
      );
    }

    // Obține profilele reviewer-ilor
    const reviewerIds = [...new Set((reviews || []).map((r: any) => r.reviewer_user_id).filter(Boolean))];
    let reviewersMap: Record<string, any> = {};

    if (reviewerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', reviewerIds);

      if (!profilesError && profiles) {
        profiles.forEach((profile: any) => {
          reviewersMap[profile.user_id] = profile;
        });
      }
    }

    // Adaugă informații despre reviewer la fiecare review
    const reviewsWithReviewers = (reviews || []).map((review: any) => ({
      ...review,
      reviewer: {
        user_profiles: reviewersMap[review.reviewer_user_id] ? [reviewersMap[review.reviewer_user_id]] : []
      }
    }));

    // Calculăm rating-ul mediu
    let avgRating = 0;
    let reviewCount = 0;
    if (reviewsWithReviewers && reviewsWithReviewers.length > 0) {
      const ratings = reviewsWithReviewers.map((r: any) => r.rating).filter((r: number) => r > 0);
      if (ratings.length > 0) {
        avgRating = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
        reviewCount = reviewsWithReviewers.length;
      }
    }

    return NextResponse.json({
      success: true,
      reviews: reviewsWithReviewers,
      avgRating: Math.round(avgRating * 10) / 10, // Rotunjire la 1 zecimală
      reviewCount,
    });
  } catch (error: any) {
    console.error('[API] Error in GET /api/reviews:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reviews
 * Creează un review nou
 */
export async function POST(request: NextRequest) {
  try {
    // Obține token-ul de autentificare
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Neautorizat. Te rugăm să te autentifici.' },
          { status: 401 }
        );
      }
      
      userId = user.id;
    } else {
      return NextResponse.json(
        { error: 'Neautorizat. Te rugăm să te autentifici.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      reviewed_user_id,
      product_id,
      rating,
      review_text,
      review_type, // 'seller' sau 'buyer'
    } = body;

    // Validare
    if (!reviewed_user_id || !product_id || !rating || !review_type) {
      return NextResponse.json(
        { error: 'reviewed_user_id, product_id, rating și review_type sunt obligatorii' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating-ul trebuie să fie între 1 și 5' },
        { status: 400 }
      );
    }

    if (review_type !== 'seller' && review_type !== 'buyer') {
      return NextResponse.json(
        { error: 'review_type trebuie să fie "seller" sau "buyer"' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Verifică dacă există o tranzacție între cei doi utilizatori pentru acest produs
    // Căutăm tranzacția în ambele direcții (userId ca buyer sau seller)
    // Cazul 1: userId este cumpărătorul, reviewed_user_id este vânzătorul
    const { data: transactionAsBuyer, error: errorAsBuyer } = await supabaseAdmin
      .from('product_transactions')
      .select('*')
      .eq('product_id', product_id)
      .eq('buyer_id', userId)
      .eq('seller_id', reviewed_user_id)
      .eq('status', 'completed')
      .maybeSingle();

    // Cazul 2: userId este vânzătorul, reviewed_user_id este cumpărătorul
    const { data: transactionAsSeller, error: errorAsSeller } = await supabaseAdmin
      .from('product_transactions')
      .select('*')
      .eq('product_id', product_id)
      .eq('seller_id', userId)
      .eq('buyer_id', reviewed_user_id)
      .eq('status', 'completed')
      .maybeSingle();

    if (errorAsBuyer || errorAsSeller) {
      console.error('[API] Error checking transaction:', errorAsBuyer || errorAsSeller);
      return NextResponse.json(
        { error: 'Eroare la verificarea tranzacției' },
        { status: 500 }
      );
    }

    // Determină tranzacția și verifică dacă review_type este corect
    let transactionData: any = null;
    let actualReviewType: 'buyer' | 'seller' | null = null;

    if (transactionAsBuyer) {
      // userId este cumpărătorul, reviewed_user_id este vânzătorul
      // Deci review-ul ar trebui să fie de tip 'buyer' (cumpărătorul lasă review pentru vânzător)
      transactionData = transactionAsBuyer;
      actualReviewType = 'buyer';
    } else if (transactionAsSeller) {
      // userId este vânzătorul, reviewed_user_id este cumpărătorul
      // Deci review-ul ar trebui să fie de tip 'seller' (vânzătorul lasă review pentru cumpărător)
      transactionData = transactionAsSeller;
      actualReviewType = 'seller';
    }

    if (!transactionData) {
      // Log pentru debugging
      console.error('[API Reviews] No transaction found:', {
        userId,
        reviewed_user_id,
        product_id,
        review_type,
        checkedAsBuyer: !!transactionAsBuyer,
        checkedAsSeller: !!transactionAsSeller
      });
      
      return NextResponse.json(
        { error: 'Nu poți lăsa un review decât dacă ai avut o tranzacție cu acest utilizator pentru acest produs' },
        { status: 403 }
      );
    }

    // Verifică dacă review_type trimis corespunde cu tranzacția găsită
    // DAR permite ambele tipuri dacă tranzacția există (pentru flexibilitate)
    // Nu mai forțăm tipul exact, doar verificăm că tranzacția există
    console.log('[API Reviews] Transaction found:', {
      transactionId: transactionData.id,
      actualReviewType,
      requestedReviewType: review_type,
      userId,
      reviewed_user_id,
      product_id
    });

    // Verifică dacă există deja un review pentru această combinație
    const { data: existingReview, error: existingError } = await supabaseAdmin
      .from('user_reviews')
      .select('id')
      .eq('reviewer_user_id', userId)
      .eq('reviewed_user_id', reviewed_user_id)
      .eq('product_id', product_id)
      .eq('review_type', review_type)
      .maybeSingle();

    let reviewData: any;

    if (existingReview) {
      // Actualizează review-ul existent
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('user_reviews')
        .update({
          rating,
          review_text: review_text || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id)
        .select()
        .single();

      if (updateError) {
        console.error('[API] Error updating review:', updateError);
        return NextResponse.json(
          { error: updateError.message || 'Failed to update review' },
          { status: 500 }
        );
      }

      reviewData = updated;
    } else {
      // Creează review nou
      const { data: created, error: createError } = await supabaseAdmin
        .from('user_reviews')
        .insert({
          reviewer_user_id: userId,
          reviewed_user_id,
          product_id,
          rating,
          review_text: review_text || null,
          review_type,
          transaction_id: transactionData.id,
          is_verified: true, // Marcat ca verificat pentru că utilizatorul a cumpărat produsul
          can_edit: true,
        })
        .select()
        .single();

      if (createError) {
        console.error('[API] Error creating review:', createError);
        return NextResponse.json(
          { error: createError.message || 'Failed to create review' },
          { status: 500 }
        );
      }

      reviewData = created;
    }

    return NextResponse.json({
      success: true,
      review: reviewData,
      message: existingReview ? 'Review actualizat cu succes!' : 'Review creat cu succes!',
    });
  } catch (error: any) {
    console.error('[API] Error in POST /api/reviews:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

