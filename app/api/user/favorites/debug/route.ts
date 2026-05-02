import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Debug endpoint to check favorites
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

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

    // Get ALL favorites
    const { data: allFavorites, error: allError } = await admin
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Get products count
    const { data: productsCount, error: productsError } = await admin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'deleted');

    // Get sample products
    const { data: sampleProducts, error: sampleError } = await admin
      .from('products')
      .select('id, slug, title, status')
      .neq('status', 'deleted')
      .limit(5);

    return NextResponse.json({
      userId,
      userEmail: authUser.user.email,
      allFavorites: allFavorites || [],
      allFavoritesCount: allFavorites?.length || 0,
      favoritesByType: {
        product: allFavorites?.filter((f: any) => f.item_type === 'product').length || 0,
        auction: allFavorites?.filter((f: any) => f.item_type === 'auction').length || 0,
      },
      productsCount: productsCount || 0,
      sampleProducts: sampleProducts || [],
      errors: {
        allError: allError?.message || null,
        productsError: productsError?.message || null,
        sampleError: sampleError?.message || null,
      }
    });
  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Server error',
      message: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}





















































