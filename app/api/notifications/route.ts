import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// DELETE - Șterge o notificare
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const { data: authUser, error: authError } = await admin.auth.getUser(accessToken);
    
    if (authError || !authUser?.user) {
      console.error('[API /api/notifications] Auth error:', authError);
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const userId = authUser.user.id;

    // Get notification ID from query
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');

    if (!notificationId) {
      return NextResponse.json({ error: 'Missing notification ID' }, { status: 400 });
    }

    console.log('[API /api/notifications] DELETE request:', { userId, notificationId });

    // Delete notification - MUST match both id AND user_id for RLS
    const { error: deleteError, count } = await admin
      .from('user_notifications')
      .delete({ count: 'exact' })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[API /api/notifications] Delete error:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to delete notification',
        details: deleteError.message 
      }, { status: 500 });
    }

    console.log('[API /api/notifications] Delete successful:', { count });

    return NextResponse.json({ 
      success: true, 
      deleted: count || 0 
    });

  } catch (error: any) {
    console.error('[API /api/notifications] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Server error',
      details: error?.message 
    }, { status: 500 });
  }
}

// POST - Șterge toate notificările (clear all)
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const { data: authUser, error: authError } = await admin.auth.getUser(accessToken);
    
    if (authError || !authUser?.user) {
      console.error('[API /api/notifications] Auth error:', authError);
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const userId = authUser.user.id;

    console.log('[API /api/notifications] POST (clear all) request for user:', userId);

    // Delete ALL notifications for this user
    const { error: deleteError, count } = await admin
      .from('user_notifications')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[API /api/notifications] Clear all error:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to clear notifications',
        details: deleteError.message 
      }, { status: 500 });
    }

    console.log('[API /api/notifications] Clear all successful:', { count });

    return NextResponse.json({ 
      success: true, 
      deleted: count || 0 
    });

  } catch (error: any) {
    console.error('[API /api/notifications] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Server error',
      details: error?.message 
    }, { status: 500 });
  }
}
