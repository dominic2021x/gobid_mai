import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// GET - Obține favorite lists pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
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

    const { data: lists, error: listsError } = await admin
      .from('user_favorite_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (listsError) {
      console.error('Failed to fetch favorite lists:', listsError);
      return NextResponse.json({ error: 'Cannot read favorite lists' }, { status: 500 });
    }

    return NextResponse.json(lists || []);
  } catch (error) {
    console.error('Unexpected error fetching favorite lists:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Creează favorite list
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
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
    const userEmail = authUser.user.email || '';
    const body = await request.json();
    const { id, name, description, pin, isDefault } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    // Check if list exists first (check by both id and user_id to avoid conflicts)
    const { data: existingList, error: checkError } = await admin
      .from('user_favorite_lists')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    
    // If checkError is not a "not found" error, log it but continue
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for existing list:', checkError);
    }

    let list;
    let insertError;

    if (existingList) {
      // Update existing list - only include fields that should be updated
      const updateData: any = {};
      
      if (name !== undefined) updateData.name = name;
      // Note: description column may not exist in the database
      // We'll update without description to avoid schema errors
      // Description will be stored separately if the column exists in the future
      if (pin !== undefined) {
        updateData.pin = pin || null;
        updateData.is_private = !!pin;
      }
      if (isDefault !== undefined) {
        updateData.is_default = isDefault;
        // If this is set as default, unset other defaults
        if (isDefault) {
          await admin
            .from('user_favorite_lists')
            .update({ is_default: false })
            .eq('user_id', userId)
            .eq('is_default', true)
            .neq('id', id);
        }
      }

      console.log('Updating list with data:', updateData);
      console.log('List ID:', id, 'User ID:', userId);
      
      // If updateData is empty, return error
      if (Object.keys(updateData).length === 0) {
        console.error('No fields to update');
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      const { data: updatedList, error: updateError } = await admin
        .from('user_favorite_lists')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      
      console.log('Update result:', { 
        updatedList, 
        updateError, 
        hasData: !!updatedList,
        dataType: Array.isArray(updatedList) ? 'array' : typeof updatedList
      });
      
      if (updateError) {
        console.error('Update error details:', JSON.stringify(updateError, null, 2));
        return NextResponse.json({ 
          error: 'Cannot update favorite list', 
          details: updateError.message || JSON.stringify(updateError)
        }, { status: 500 });
      }
      
      if (!updatedList) {
        // If no error but no data returned, try to fetch the list
        console.log('No data returned, fetching list...');
        const { data: fetchedList, error: fetchError } = await admin
          .from('user_favorite_lists')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .single();
        
        console.log('Fetched list:', fetchedList, 'Fetch error:', fetchError);
        
        if (fetchError || !fetchedList) {
          return NextResponse.json({ 
            error: 'List not found after update',
            details: fetchError?.message 
          }, { status: 404 });
        }
        
        list = fetchedList;
        insertError = null;
      } else {
        list = updatedList;
        insertError = null;
      }
      
      // Ensure we have a valid list before returning
      if (!list) {
        console.error('List is still null after update attempt');
        return NextResponse.json({ 
          error: 'Failed to update list - list not found',
          details: 'The list could not be retrieved after update'
        }, { status: 500 });
      }
    } else {
      // Insert new list - include all required fields
      const insertData: any = {
        id,
        user_id: userId,
        user_email: userEmail
      };

      if (name !== undefined) insertData.name = name;
      // Note: description column may not exist in the database
      // We'll skip description to avoid schema errors
      if (pin !== undefined) {
        insertData.pin = pin || null;
        insertData.is_private = !!pin;
      }
      if (isDefault !== undefined) {
        insertData.is_default = isDefault;
        // If this is set as default, unset other defaults
        if (isDefault) {
          await admin
            .from('user_favorite_lists')
            .update({ is_default: false })
            .eq('user_id', userId)
            .eq('is_default', true);
        }
      }

      const { data: newList, error: upsertError } = await admin
        .from('user_favorite_lists')
        .insert(insertData)
        .select()
        .single();
      
      list = newList;
      insertError = upsertError;
    }

    if (insertError) {
      console.error('Failed to create/update favorite list:', insertError);
      return NextResponse.json({ error: 'Cannot create/update favorite list', details: insertError.message }, { status: 500 });
    }

    if (!list) {
      console.error('List is null or undefined after operation');
      return NextResponse.json({ error: 'List not found or not accessible' }, { status: 404 });
    }

    console.log('Returning list:', JSON.stringify(list, null, 2));
    return NextResponse.json(list, { status: 200 });
  } catch (error) {
    console.error('Unexpected error creating favorite list:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Șterge favorite list
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
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
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');

    if (!listId) {
      return NextResponse.json({ error: 'Missing listId' }, { status: 400 });
    }

    // Delete all favorites in this list
    await admin
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('favorite_list_id', listId);

    // Delete the list
    const { error: deleteError } = await admin
      .from('user_favorite_lists')
      .delete()
      .eq('user_id', userId)
      .eq('id', listId);

    if (deleteError) {
      console.error('Failed to delete favorite list:', deleteError);
      return NextResponse.json({ error: 'Cannot delete favorite list' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting favorite list:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



