import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține favorites pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const userEmail = authUser.email || '';

    // Get favorites
    const { data: favorites, error: favoritesError } = await admin
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (favoritesError) {
      console.error('Failed to fetch favorites:', favoritesError);
      return NextResponse.json({ error: 'Cannot read favorites' }, { status: 500 });
    }

    // DEBUG: Log favorites for current user
    console.log('[API /api/user/favorites] User:', userId, 'Email:', userEmail);
    console.log('[API /api/user/favorites] Total favorites:', favorites?.length || 0);
    console.log('[API /api/user/favorites] User favorites:', favorites?.filter((f: any) => f.item_type === 'user').length || 0);
    if (favorites && favorites.length > 0) {
      const userFavorites = favorites.filter((f: any) => f.item_type === 'user');
      console.log('[API /api/user/favorites] User favorite IDs:', userFavorites.map((f: any) => f.item_id));
    }

    // Get favorite lists
    const { data: favoriteLists, error: listsError } = await admin
      .from('user_favorite_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (listsError) {
      console.error('Failed to fetch favorite lists:', listsError);
      return NextResponse.json({ error: 'Cannot read favorite lists' }, { status: 500 });
    }

    return NextResponse.json({
      favorites: favorites || [],
      favoriteLists: favoriteLists || []
    });
  } catch (error) {
    console.error('Unexpected error fetching favorites:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă favorite
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const userEmail = authUser.email || '';
    const body = await request.json();
    const { itemId, itemType, favoriteListId } = body;

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Missing itemId or itemType' }, { status: 400 });
    }

    // Normalize favoriteListId: treat empty string, null, or undefined as null
    const normalizedFavoriteListId = favoriteListId && favoriteListId.trim() !== '' ? favoriteListId : null;

    // Validate item_type
    const allowedTypes = ['auction', 'product', 'user'];
    if (!allowedTypes.includes(itemType)) {
      console.error('Invalid item_type:', itemType);
      return NextResponse.json({ 
        error: 'Invalid item type',
        details: `item_type must be one of: ${allowedTypes.join(', ')}`,
        code: 'INVALID_ITEM_TYPE'
      }, { status: 400 });
    }

    // Prevent saving auctions/products in "Lista Useri favoriti" (only for users)
    if (favoriteListId === 'lista-useri-favoriti' && itemType !== 'user') {
      return NextResponse.json({ 
        error: 'Invalid list for this item type',
        details: 'Lista Useri favoriti este exclusiv pentru utilizatori. Nu poți salva anunțuri sau produse în această listă.',
        code: 'INVALID_LIST_FOR_ITEM_TYPE'
      }, { status: 400 });
    }

    // Check if the item is already saved (prevent duplicates)
    const { data: existingFavorite, error: checkError } = await admin
      .from('user_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .eq('item_type', itemType)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing favorite:', checkError);
      return NextResponse.json({ 
        error: 'Error checking favorite',
        details: 'A apărut o eroare la verificarea favoritelor existente.',
        code: 'CHECK_ERROR'
      }, { status: 500 });
    }

    // If item already exists, return success with a flag indicating it's already saved
    if (existingFavorite) {
      return NextResponse.json({ 
        success: true,
        alreadyExists: true,
        message: 'Este deja salvat la favorite',
        favorite: existingFavorite
      }, { status: 200 });
    }

    // If no favoriteListId is provided, check if user has any lists
    // If no lists exist, create "LISTA 1" automatically
    let finalFavoriteListId = normalizedFavoriteListId;
    
    if (!finalFavoriteListId) {
      // Check if user has any favorite lists
      const { data: existingLists, error: listsCheckError } = await admin
        .from('user_favorite_lists')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (listsCheckError) {
        console.error('Error checking for existing lists:', listsCheckError);
      }

      // If no lists exist, create "LISTA 1"
      if (!existingLists || existingLists.length === 0) {
        const lista1Id = `lista-1-${userId}`;
        
        const { data: newList, error: createListError } = await admin
          .from('user_favorite_lists')
          .insert({
            id: lista1Id,
            user_id: userId,
            user_email: userEmail,
            name: 'LISTA 1'
          })
          .select()
          .single();

        if (createListError) {
          console.error('Failed to create LISTA 1:', createListError);
          // Continue anyway, will save without list
        } else {
          finalFavoriteListId = newList.id;
          console.log('Created LISTA 1 automatically:', finalFavoriteListId);
        }
      } else {
        // Use the first existing list
        finalFavoriteListId = existingLists[0].id;
      }
    }

    const { data: favorite, error: insertError } = await admin
      .from('user_favorites')
      .insert({
        user_id: userId,
        user_email: userEmail,
        item_id: itemId,
        item_type: itemType,
        favorite_list_id: finalFavoriteListId
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to add favorite:', insertError);
      console.error('Item details:', { itemId, itemType, favoriteListId, userId });
      console.error('Full error object:', JSON.stringify(insertError, null, 2));
      
      // Check if it's a constraint violation
      let errorMessage = insertError.message || insertError.code || 'Cannot add favorite';
      let errorCode = insertError.code;
      
      // Provide more helpful error messages
      if (insertError.code === '23514' || insertError.message?.includes('check constraint')) {
        errorMessage = 'Tipul de item nu este permis. Te rugăm să rulezi migrația pentru a permite salvarea utilizatorilor.';
        errorCode = 'CONSTRAINT_VIOLATION';
      } else if (insertError.message?.includes('violates check constraint')) {
        errorMessage = 'Tipul de item nu este permis. Te rugăm să rulezi migrația pentru a permite salvarea utilizatorilor.';
        errorCode = 'CONSTRAINT_VIOLATION';
      }
      
      return NextResponse.json({ 
        error: 'Cannot add favorite',
        details: errorMessage,
        code: errorCode,
        hint: itemType === 'user' ? 'Asigură-te că migrația 20250208_allow_user_favorites.sql a fost rulată în Supabase.' : undefined
      }, { status: 500 });
    }

    return NextResponse.json(favorite);
  } catch (error) {
    console.error('Unexpected error adding favorite:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Șterge favorite
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const itemType = searchParams.get('itemType');
    const favoriteListId = searchParams.get('favoriteListId');

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Missing itemId or itemType' }, { status: 400 });
    }

    // Build delete query
    let deleteQuery = admin
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .eq('item_type', itemType);

    // If favoriteListId is provided, only delete from that specific list
    // Otherwise, delete all favorites for this item (for backward compatibility)
    if (favoriteListId) {
      deleteQuery = deleteQuery.eq('favorite_list_id', favoriteListId);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('Failed to delete favorite:', deleteError);
      return NextResponse.json({ error: 'Cannot delete favorite' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting favorite:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



