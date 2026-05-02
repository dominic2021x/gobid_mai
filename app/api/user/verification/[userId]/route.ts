import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function isAuthRetryableTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name : '';
  const marker = e.__isAuthError === true;
  const message = typeof e.message === 'string' ? e.message : '';
  return status === 504 || marker || name.includes('AuthRetryableFetchError') || message.includes('AuthRetryableFetchError');
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Lipsește ID-ul utilizatorului' }, { status: 400 });
    }

    const admin = supabaseAdmin;

    // Get user from auth.users (degrade gracefully on transient auth timeouts)
    let user: any = null;
    let authUnavailable = false;
    try {
      const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);

      if (authError) {
        if (isAuthRetryableTimeoutError(authError)) {
          authUnavailable = true;
        } else {
          console.error('Error fetching user from auth:', authError);
          return NextResponse.json({ error: 'Eroare la încărcarea utilizatorului' }, { status: 500 });
        }
      }

      if (!authUnavailable && !authUser?.user) {
        return NextResponse.json({ error: 'Utilizatorul nu a fost găsit' }, { status: 404 });
      }

      user = authUser?.user ?? null;
    } catch (error: any) {
      if (isAuthRetryableTimeoutError(error)) {
        authUnavailable = true;
      } else {
        console.error('Error in getUserById:', error);
        return NextResponse.json({ error: 'Eroare la încărcarea utilizatorului' }, { status: 500 });
      }
    }

    // Check email verification
    const emailVerified = !!user?.email_confirmed_at;

    // Check provider from identities or metadata
    let provider: string | undefined = undefined;
    let googleVerified = false;
    let appleVerified = false;

    // Check identities for provider
    if (user?.identities && user.identities.length > 0) {
      const googleIdentity = user.identities.find((id: any) => id.provider === 'google');
      const appleIdentity = user.identities.find((id: any) => id.provider === 'apple');
      
      if (googleIdentity) {
        provider = 'google';
        googleVerified = true;
      } else if (appleIdentity) {
        provider = 'apple';
        appleVerified = true;
      }
    }

    // Check metadata for provider
    if (!provider) {
      const userMetadata = user?.user_metadata || {};
      const appMetadata = user?.app_metadata || {};
      
      if (userMetadata.provider === 'google' || appMetadata.provider === 'google') {
        provider = 'google';
        googleVerified = true;
      } else if (userMetadata.provider === 'apple' || appMetadata.provider === 'apple') {
        provider = 'apple';
        appleVerified = true;
      }
    }

    // Check email domain for provider detection (fallback)
    if (!provider && user?.email) {
      const email = user.email.toLowerCase();
      if (email.includes('@gmail.com') || email.includes('@googlemail.com')) {
        provider = 'google';
        googleVerified = emailVerified; // If email is verified and it's a Gmail, consider Google verified
      } else if (email.includes('@icloud.com') || email.includes('@me.com') || email.includes('@mac.com')) {
        provider = 'apple';
        appleVerified = emailVerified; // If email is verified and it's an Apple email, consider Apple verified
      }
    }

    // Check phone verification from auth.users (phone_confirmed_at)
    // Telefonul este verificat DOAR dacă există phone_confirmed_at în auth.users
    const phoneVerified = !!user?.phone_confirmed_at;

    // Get location from user_profiles
    const { data: profile } = await admin
      .from('user_profiles')
      .select('city, address, country')
      .eq('user_id', userId)
      .maybeSingle();

    // CNP nu există în user_profiles - setăm la false
    const cnpVerified = false;

    // Build location string
    const locationParts = [];
    if (profile?.city) locationParts.push(profile.city);
    if (profile?.country) locationParts.push(profile.country);
    const location = locationParts.length > 0 ? locationParts.join(', ') : undefined;

    // Get last sign in time
    const lastSignInAt = user?.last_sign_in_at ? new Date(user.last_sign_in_at) : undefined;

    // Get followers and following counts from user_follows table
    let followersCount = 0;
    let followingCount = 0;
    
    try {
      // Count followers (users who follow this user)
      const { count: followers, error: followersError } = await admin
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('followed_user_id', userId);
      
      // If table doesn't exist, error code will be '42P01'
      if (followersError && followersError.code === '42P01') {
        // Table doesn't exist yet, use default values (0)
        followersCount = 0;
        followingCount = 0;
      } else if (followersError) {
        // Other errors - log but don't fail
        console.error('Error fetching followers count:', followersError);
        followersCount = 0;
      } else {
        followersCount = followers || 0;
      }
      
      // Count following (users that this user follows) - only if table exists
      if (!followersError || followersError.code !== '42P01') {
        const { count: following, error: followingError } = await admin
          .from('user_follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_user_id', userId);
        
        if (followingError && followingError.code !== '42P01') {
          console.error('Error fetching following count:', followingError);
          followingCount = 0;
        } else {
          followingCount = following || 0;
        }
      }
    } catch (error: any) {
      // Catch any unexpected errors
      console.error('Error fetching followers/following counts:', error);
      followersCount = 0;
      followingCount = 0;
    }

    return NextResponse.json({
      emailVerified,
      phoneVerified,
      cnpVerified,
      googleVerified,
      appleVerified,
      provider,
      location,
      lastSignInAt: lastSignInAt ? lastSignInAt.toISOString() : undefined,
      followersCount,
      followingCount,
      authUnavailable
    });
  } catch (error) {
    console.error('Error fetching verification info:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}
