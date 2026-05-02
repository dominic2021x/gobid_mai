import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * GET /api/admin/users/profiles
 * Returnează profilele utilizatorilor
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // If userId or email is provided, return single profile
    if (userId || email) {
      let query = supabaseAdmin
        .from('user_profiles')
        .select('user_id, first_name, last_name, phone, avatar_url, created_at');
      
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (email) {
        // Email is not in user_profiles, need to get it from auth.users
        // For now, we can't query by email directly from user_profiles
        return NextResponse.json({
          success: false,
          error: 'Querying by email requires auth.users lookup',
        }, { status: 400 });
      }
      
      const { data: profile, error } = await query.maybeSingle();

      if (error) {
        console.error('Error loading user profile:', error);
        return NextResponse.json({
          success: false,
          error: error.message || 'Failed to load profile',
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        profile: profile || null,
      });
    }

    // Otherwise return list of profiles
    let query = supabaseAdmin
      .from('user_profiles')
      .select('user_id, first_name, last_name, phone, avatar_url, created_at')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    const { data: profiles, error } = await query;

    if (error) {
      console.error('Error loading user profiles:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to load profiles',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profiles: profiles || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/users/profiles:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to load profiles',
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/profiles
 * Returnează profilele pentru o listă de user IDs
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'userIds must be a non-empty array',
      }, { status: 400 });
    }

    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, first_name, last_name, phone, avatar_url, created_at')
      .in('user_id', userIds);

    if (error) {
      console.error('Error loading user profiles:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to load profiles',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profiles: profiles || [],
    });
  } catch (error: any) {
    console.error('Error in POST /api/admin/users/profiles:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to load profiles',
    }, { status: 500 });
  }
}

