import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Debug endpoint to check OAuth configuration
 * Access at: /api/auth/google/debug
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ? 'SET (hidden)' : 'NOT SET';
  
  // Get redirect URI from multiple sources
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  const requestOrigin = `${protocol}://${host}`;
  
  // Calculate redirect URI
  let redirectUri: string;
  if (envSiteUrl) {
    redirectUri = `${envSiteUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  } else {
    redirectUri = `${requestOrigin}/api/auth/google/callback`;
  }
  
  // Build OAuth URL for reference
  const oauthUrl = clientId 
    ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile`
    : 'N/A (Client ID missing)';
  
  return NextResponse.json({
    status: 'ok',
    configuration: {
      clientId: clientId ? `${clientId.substring(0, 30)}...` : 'NOT SET',
      clientSecret: clientSecret,
      redirectUri: redirectUri,
      envSiteUrl: envSiteUrl || 'NOT SET',
      requestOrigin: requestOrigin,
      protocol: protocol,
      host: host,
    },
    oauthUrl: oauthUrl,
    instructions: {
      step1: 'Copy the redirectUri value above',
      step2: 'Go to Google Console: https://console.cloud.google.com/apis/credentials',
      step3: 'Click on your OAuth 2.0 Client ID',
      step4: 'In "Authorized redirect URIs", add the exact redirectUri value',
      step5: 'Save and wait 1-2 minutes for changes to propagate',
      step6: 'Try again',
    },
    commonIssues: {
      trailingSlash: 'Make sure redirect URI has NO trailing slash',
      protocol: 'Use http:// for localhost, https:// for production',
      exactMatch: 'Redirect URI must match EXACTLY (case-sensitive)',
      propagation: 'Changes in Google Console can take 1-2 minutes to propagate',
    }
  }, {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}


