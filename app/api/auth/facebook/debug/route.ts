import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Debug endpoint to check Facebook OAuth configuration
 * Access at: /api/auth/facebook/debug
 */
export async function GET(request: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET ? 'SET (hidden)' : 'NOT SET';
  
  // Get redirect URI from multiple sources
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  const requestOrigin = `${protocol}://${host}`;
  
  // Calculate redirect URI
  let redirectUri: string;
  if (envSiteUrl) {
    redirectUri = `${envSiteUrl.replace(/\/$/, '')}/api/auth/facebook/callback`;
  } else {
    redirectUri = `${requestOrigin}/api/auth/facebook/callback`;
  }
  
  // Build OAuth URL for reference
  const oauthUrl = appId 
    ? `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=email,public_profile&response_type=code`
    : 'N/A (App ID missing)';
  
  return NextResponse.json({
    status: 'ok',
    configuration: {
      appId: appId ? `${appId.substring(0, 10)}...` : 'NOT SET',
      appSecret: appSecret,
      redirectUri: redirectUri,
      envSiteUrl: envSiteUrl || 'NOT SET',
      requestOrigin: requestOrigin,
      protocol: protocol,
      host: host,
    },
    oauthUrl: oauthUrl,
    instructions: {
      step1: 'Copy the redirectUri value above',
      step2: 'Go to Facebook Developers: https://developers.facebook.com/apps',
      step3: 'Select your app',
      step4: 'Go to Settings → Basic',
      step5: 'In "Valid OAuth Redirect URIs", add the exact redirectUri value',
      step6: 'Save and wait 1-2 minutes for changes to propagate',
      step7: 'Try again',
    },
    commonIssues: {
      trailingSlash: 'Make sure redirect URI has NO trailing slash',
      protocol: 'Use http:// for localhost, https:// for production',
      exactMatch: 'Redirect URI must match EXACTLY (case-sensitive)',
      propagation: 'Changes in Facebook App Settings can take 1-2 minutes to propagate',
    }
  }, {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}


