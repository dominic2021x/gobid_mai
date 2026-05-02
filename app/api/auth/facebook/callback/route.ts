import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorReason = searchParams.get('error_reason');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      console.error('Facebook OAuth error:', { error, errorReason, errorDescription });
      return NextResponse.redirect(
        new URL(`/auth?error=${encodeURIComponent(error)}&reason=${encodeURIComponent(errorReason || '')}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/auth?error=no_code', request.url)
      );
    }

    // Get App ID and Secret from env
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    
    // Use NEXT_PUBLIC_SITE_URL if available, otherwise determine from request
    let redirectUri: string;
    
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      // Use configured site URL (must match Facebook App Settings)
      redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/facebook/callback`;
    } else {
      // Fallback to request headers
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;
    }
    
    console.log('🔧 Facebook OAuth Callback Config:', {
      appId: appId ? `${appId.substring(0, 10)}...` : 'MISSING',
      redirectUri,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET'
    });

    if (!appId || !appSecret) {
      return NextResponse.redirect(
        new URL('/auth?error=config_error', request.url)
      );
    }

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    
    const tokenResponse = await fetch(tokenUrl);
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Facebook token error:', errorData);
      return NextResponse.redirect(
        new URL(`/auth?error=${encodeURIComponent(errorData.error?.message || 'token_error')}`, request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(
        new URL('/auth?error=no_access_token', request.url)
      );
    }

    // Get user info from Facebook Graph API
    const userInfoUrl = `https://graph.facebook.com/v18.0/me?fields=id,name,email,first_name,last_name,picture&access_token=${accessToken}`;
    const userInfoResponse = await fetch(userInfoUrl);

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.json();
      console.error('Facebook user info error:', errorData);
      return NextResponse.redirect(
        new URL(`/auth?error=${encodeURIComponent(errorData.error?.message || 'user_info_error')}`, request.url)
      );
    }

    const userData = await userInfoResponse.json();

    // Extract user info
    const userInfo = {
      firstName: userData.first_name || userData.name?.split(' ')[0] || 'User',
      lastName: userData.last_name || userData.name?.split(' ').slice(1).join(' ') || '',
      email: userData.email || '',
      avatar: userData.picture?.data?.url || userData.picture || '',
      phone: '',
      provider: 'facebook',
      facebookId: userData.id,
    };

    // Save user info to localStorage via redirect with data
    const redirectUrl = new URL('/auth/facebook-success', request.url);
    redirectUrl.searchParams.set('data', encodeURIComponent(JSON.stringify(userInfo)));
    
    // Also check if this is admin login
    if (state && state.includes('admin')) {
      redirectUrl.searchParams.set('admin', 'true');
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error('Facebook OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(error.message || 'unknown_error')}`, request.url)
    );
  }
}


