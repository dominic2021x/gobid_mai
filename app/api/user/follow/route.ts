import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }
    const { followedUserId } = await request.json();

    if (!followedUserId) {
      return NextResponse.json({ error: 'Lipsește ID-ul utilizatorului de urmărit' }, { status: 400 });
    }

    if (user.id === followedUserId) {
      return NextResponse.json({ error: 'Nu poți urmări propriul profil' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Check if follow relationship already exists
    const { data: existingFollow, error: checkError } = await admin
      .from('user_follows')
      .select('id')
      .eq('follower_user_id', user.id)
      .eq('followed_user_id', followedUserId)
      .maybeSingle();

    // If table doesn't exist (error code 42P01) or message contains "does not exist"
    if (checkError && (
      checkError.code === '42P01' || 
      checkError.message?.toLowerCase().includes('does not exist') ||
      checkError.message?.toLowerCase().includes('relation') && checkError.message?.toLowerCase().includes('not exist')
    )) {
      return NextResponse.json({ 
        error: 'Funcționalitatea de urmărire nu este încă disponibilă. Te rugăm să rulezi migrarea SQL în Supabase pentru a crea tabela user_follows.' 
      }, { status: 501 });
    }

    // Other errors (except PGRST116 which means "no rows found" - that's OK)
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing follow:', checkError);
      // If it's a permission/RLS error, provide a more helpful message
      if (checkError.code === '42501' || checkError.message?.toLowerCase().includes('permission') || checkError.message?.toLowerCase().includes('policy')) {
        return NextResponse.json({ 
          error: 'Eroare de permisiuni. Te rugăm să verifici că RLS policies sunt configurate corect pentru tabela user_follows.',
          details: checkError.message || checkError.code 
        }, { status: 500 });
      }
      return NextResponse.json({ 
        error: 'Eroare la verificarea stării de urmărire',
        details: checkError.message || checkError.code 
      }, { status: 500 });
    }

    // If follow relationship already exists
    if (existingFollow) {
      return NextResponse.json({ error: 'Urmărești deja acest utilizator' }, { status: 400 });
    }

    // Create follow relationship
    const { error: insertError } = await admin
      .from('user_follows')
      .insert({
        follower_user_id: user.id,
        followed_user_id: followedUserId
      });

    if (insertError) {
      // If table doesn't exist, return error message in Romanian
      if (insertError.code === '42P01') {
        return NextResponse.json({ 
          error: 'Funcționalitatea de urmărire nu este încă disponibilă. Te rugăm să rulezi migrarea SQL în Supabase pentru a crea tabela user_follows.' 
        }, { status: 501 });
      }
      console.error('Error creating follow:', insertError);
      return NextResponse.json({ 
        error: 'Eroare la urmărirea utilizatorului', 
        details: insertError.message || insertError.code || JSON.stringify(insertError)
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in follow POST:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const followedUserId = searchParams.get('followedUserId');

    if (!followedUserId) {
      return NextResponse.json({ error: 'Lipsește ID-ul utilizatorului' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Delete follow relationship
    const { error: deleteError } = await admin
      .from('user_follows')
      .delete()
      .eq('follower_user_id', user.id)
      .eq('followed_user_id', followedUserId);

    if (deleteError) {
      if (deleteError.code === '42P01') {
        return NextResponse.json({ error: 'Funcționalitatea de urmărire nu este încă disponibilă. Te rugăm să rulezi migrarea SQL în Supabase pentru a crea tabela user_follows.' }, { status: 501 });
      }
      console.error('Error deleting follow:', deleteError);
      return NextResponse.json({ 
        error: 'Eroare la oprirea urmăririi utilizatorului',
        details: deleteError.message || deleteError.code
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in follow DELETE:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const followedUserId = searchParams.get('followedUserId');

    if (!followedUserId) {
      return NextResponse.json({ error: 'Lipsește ID-ul utilizatorului' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Check if user is following the target user
    const { data: follow, error: checkError } = await admin
      .from('user_follows')
      .select('id')
      .eq('follower_user_id', user.id)
      .eq('followed_user_id', followedUserId)
      .maybeSingle();

    // If table doesn't exist (error code 42P01), return false (not following)
    if (checkError && checkError.code === '42P01') {
      // Table doesn't exist yet, return false (user is not following)
      return NextResponse.json({ isFollowing: false });
    }

    // PGRST116 means "no rows found" - that's OK, user is not following
    if (checkError && checkError.code === 'PGRST116') {
      return NextResponse.json({ isFollowing: false });
    }

    // Other errors - log but don't fail, just return false (user is not following)
    if (checkError) {
      console.error('Error checking follow status:', checkError);
      return NextResponse.json({ isFollowing: false });
    }

    // No error, check if follow relationship exists
    return NextResponse.json({ isFollowing: !!follow });
  } catch (error: any) {
    // Catch any unexpected errors (including table not found)
    if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      return NextResponse.json({ isFollowing: false });
    }
    console.error('Error in follow GET:', error);
    // Don't throw error, just return false (user is not following)
    return NextResponse.json({ isFollowing: false });
  }
}

