import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { supabaseAdmin } from '@/lib/supabase';
import { upsertUserProfile, usernameFromEmail } from '@/lib/auth/profile/upsertUserProfile';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    console.log('🔵 Google OAuth Callback received');
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('❌ Google OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/auth?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      console.error('❌ No code in callback');
      return NextResponse.redirect(
        new URL('/auth?error=no_code', request.url)
      );
    }

    console.log('✅ Received OAuth code, exchanging for tokens...');

    // Get client ID and secret from env (support both NEXT_PUBLIC and non-prefixed)
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Use NEXT_PUBLIC_SITE_URL if available, otherwise determine from request
    let redirectUri: string;
    
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      // Use configured site URL (must match Google Console)
      redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/google/callback`;
    } else {
      // Fallback to request headers
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      redirectUri = `${protocol}://${host}/api/auth/google/callback`;
    }
    
    // IMPORTANT: redirect_uri must EXACTLY match Google Console and client auth URL
    console.log('[Google OAuth] redirect_uri used in prod:', redirectUri);
    console.log('[Google OAuth] Config:', {
      clientId: clientId ? `${clientId.substring(0, 20)}...` : 'MISSING',
      redirectUri,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET'
    });

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/auth?error=config_error', request.url)
      );
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    
    if (!payload) {
      return NextResponse.redirect(
        new URL('/auth?error=invalid_token', request.url)
      );
    }

    // Extract user info
    const userInfo = {
      firstName: payload.given_name || payload.name?.split(' ')[0] || 'User',
      lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '',
      email: payload.email || '',
      avatar: payload.picture || '',
      phone: '',
      provider: 'google',
      googleId: payload.sub,
    };

    if (!userInfo.email) {
      return NextResponse.redirect(
        new URL('/auth?error=no_email', request.url)
      );
    }

    // Create or get user in Supabase
    let supabaseUserId: string | null = null;
    
    if (supabaseAdmin) {
      try {
        // Check if user exists by email
        const { data: existingUsers, error: checkError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!checkError && existingUsers) {
          const existingUser = existingUsers.users.find(u => u.email === userInfo.email);
          if (existingUser) {
            supabaseUserId = existingUser.id;
          }
        }

        // If user doesn't exist, create it
        if (!supabaseUserId) {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: userInfo.email,
            email_confirm: true,
            user_metadata: {
              first_name: userInfo.firstName,
              last_name: userInfo.lastName,
              avatar_url: userInfo.avatar,
              provider: 'google',
              google_id: userInfo.googleId,
            },
          });

          if (createError) {
            console.error('Error creating Supabase user:', createError);
          } else if (newUser?.user) {
            supabaseUserId = newUser.user.id;
          }
        } else {
          // Update existing user metadata
          await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
            user_metadata: {
              first_name: userInfo.firstName,
              last_name: userInfo.lastName,
              avatar_url: userInfo.avatar,
              provider: 'google',
              google_id: userInfo.googleId,
            },
          });
        }

        // Create or update user profile and tokens
        if (supabaseUserId) {
          const derivedUsername = usernameFromEmail(userInfo.email);
          await upsertUserProfile(supabaseAdmin, {
            userId: supabaseUserId,
            firstName: userInfo.firstName || null,
            lastName: userInfo.lastName || null,
            email: userInfo.email,
            avatarUrl: userInfo.avatar || null,
            phone: userInfo.phone || null,
            username: derivedUsername ?? undefined,
            source: 'google_oauth',
          });

          // Create or update user tokens (only if doesn't exist - don't overwrite existing tokens)
          const { data: existingTokens } = await supabaseAdmin
            .from('user_tokens')
            .select('*')
            .eq('user_id', supabaseUserId)
            .maybeSingle();

          if (!existingTokens) {
            // Only create if doesn't exist - preserve any tokens from localStorage migration
            await supabaseAdmin
              .from('user_tokens')
              .upsert({
                user_id: supabaseUserId,
                user_email: userInfo.email,
                balance: 0,
                total_earned: 0,
                total_spent: 0,
                level: 'Basic',
                package_type: 'Basic'
              }, { onConflict: 'user_id' });
            
            console.log('✅ User tokens record created for Google login (custom OAuth)');
          }

          // Generate a magic link to create a session
          // This will allow the user to sign in without password
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: userInfo.email,
          });

          if (!linkError && linkData?.properties) {
            // Get the magic link URL
            const magicLink = linkData.properties.action_link;
            
            // Extract the token from the magic link if available
            const tokenMatch = magicLink?.match(/token=([^&]+)/);
            const hashMatch = magicLink?.match(/token_hash=([^&]+)/);
            
            // Save token info to pass to client
            // Use NEXT_PUBLIC_SITE_URL if available, otherwise use request origin
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
              ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
              : `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;
            
            const redirectUrl = new URL('/auth/google-success', baseUrl);
            redirectUrl.searchParams.set('data', encodeURIComponent(JSON.stringify({
              ...userInfo,
              supabaseUserId,
              magicLink: magicLink || null,
              magicLinkToken: tokenMatch?.[1] || null,
              magicLinkHash: hashMatch?.[1] || linkData.properties.hashed_token || null,
            })));
            
            if (state && state.includes('admin')) {
              redirectUrl.searchParams.set('admin', 'true');
            }

            console.log('✅ Redirecting to:', redirectUrl.toString());
            return NextResponse.redirect(redirectUrl);
          } else {
            console.error('Error generating magic link:', linkError);
          }
        }
      } catch (error) {
        console.error('Error managing Supabase user:', error);
        // Continue anyway - we'll still save to localStorage
      }
    }

    // Fallback: Save user info to localStorage via redirect with data
    console.log('📤 Redirecting to google-success with user data');
    // Use NEXT_PUBLIC_SITE_URL if available, otherwise use request origin
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
      : `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;
    
    const redirectUrl = new URL('/auth/google-success', baseUrl);
    const userData = {
      ...userInfo,
      supabaseUserId,
    };
    redirectUrl.searchParams.set('data', encodeURIComponent(JSON.stringify(userData)));
    
    // Also check if this is admin login
    if (state && state.includes('admin')) {
      redirectUrl.searchParams.set('admin', 'true');
    }

    console.log('✅ Redirect URL:', redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(error.message || 'unknown_error')}`, request.url)
    );
  }
}

