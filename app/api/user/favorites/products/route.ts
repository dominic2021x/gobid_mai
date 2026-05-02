import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține produsele pentru favorite-urile utilizatorului
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

    // Get favorites - BOTH 'product' AND 'auction' types (because /ro saves products as 'auction')
    const { data: favorites, error: favoritesError } = await admin
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId)
      .in('item_type', ['product', 'auction'])
      .order('created_at', { ascending: false });

    if (favoritesError) {
      console.error('Failed to fetch favorites:', favoritesError);
      return NextResponse.json({ error: 'Cannot read favorites' }, { status: 500 });
    }

    if (!favorites || favorites.length === 0) {
      console.log('[Favorites API] No favorites found');
      return NextResponse.json({ products: [] });
    }

    console.log('[Favorites API] Total favorites:', favorites.length, 'Types:', favorites.map((f: any) => f.item_type));

    // Get all item IDs (both product and auction - we'll check which are products)
    const itemIds = favorites.map((f: any) => f.item_id);
    
    console.log('[Favorites API] Item IDs to check:', itemIds.length, itemIds.slice(0, 5));
    
    // Separate UUIDs and slugs
    const uuids = itemIds.filter((id: string) => 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );
    const slugs = itemIds.filter((id: string) => 
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );

    console.log('[Favorites API] UUIDs:', uuids.length, 'Slugs:', slugs.length);

    let productsData: any[] = [];

    // Load by UUID - check ALL items (both products and auctions)
    if (uuids.length > 0) {
      const { data, error } = await admin
        .from('products')
        .select('*')
        .in('id', uuids)
        .neq('status', 'deleted');

      if (error) {
        console.error('[Favorites API] Error loading products by UUID:', error);
      } else {
        console.log('[Favorites API] Loaded by UUID:', data?.length || 0, 'products');
        if (data) {
          productsData = [...productsData, ...data];
        }
      }
    }

    // Load by slug - check ALL items (both products and auctions)
    if (slugs.length > 0) {
      const { data, error } = await admin
        .from('products')
        .select('*')
        .in('slug', slugs)
        .neq('status', 'deleted');

      if (error) {
        console.error('[Favorites API] Error loading products by slug:', error);
      } else {
        console.log('[Favorites API] Loaded by slug:', data?.length || 0, 'products');
        if (data) {
          productsData = [...productsData, ...data];
        }
      }
    }

    // Remove duplicates
    const uniqueProducts = productsData.filter((product, index, self) => 
      index === self.findIndex(p => p.id === product.id)
    );

    console.log('[Favorites API] Final unique products:', uniqueProducts.length);

    return NextResponse.json({ products: uniqueProducts });
  } catch (error) {
    console.error('Unexpected error fetching favorite products:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

