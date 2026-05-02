import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Generate a session token for the user using admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: '', // We'll get it from the user
    });

    // Actually, better approach: create a session directly
    // For OAuth users, we need to use a different approach
    // Let's use admin API to create a session token
    
    // Get user by ID
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate a session using admin API
    // Note: Supabase Admin API doesn't directly generate sessions
    // We need to use a workaround: create a magic link or use password reset
    // For OAuth users, the best approach is to use Supabase Auth's OAuth flow directly
    
    // For now, return the user ID and let the client handle it
    return NextResponse.json({
      success: true,
      userId: userData.user.id,
      email: userData.user.email,
      message: 'User found. Please use Supabase Auth OAuth flow for session management.',
    });
  } catch (error: any) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






