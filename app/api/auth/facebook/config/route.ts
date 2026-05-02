import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * API Route to expose Facebook App ID to frontend
 * This is safe because App ID is public
 */
export async function GET(request: NextRequest) {
  // Support both NEXT_PUBLIC_FACEBOOK_APP_ID and FACEBOOK_APP_ID
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID;
  
  // Use NEXT_PUBLIC_SITE_URL if available, otherwise determine from request
  let redirectUri: string;
  
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    // Use configured site URL (recommended)
    redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/facebook/callback`;
  } else {
    // Fallback to request headers
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;
  }
  
  return NextResponse.json({ 
    appId: appId || '',
    redirectUri: redirectUri,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
  });
}


