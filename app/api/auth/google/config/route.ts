import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * API Route to expose Google Client ID to frontend
 * This is safe because Client ID is public
 */
export async function GET(request: NextRequest) {
  // Support both NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  
  // Use NEXT_PUBLIC_SITE_URL if available, otherwise determine from request
  let redirectUri: string;
  
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    // Use configured site URL (recommended)
    redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/google/callback`;
  } else {
    // Fallback to request headers
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  }
  
  return NextResponse.json({ 
    clientId: clientId || '',
    redirectUri: redirectUri,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
  });
}
