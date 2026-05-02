import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * API Route to expose Apple Services ID and redirect URI for Sign in with Apple.
 *
 * Pe localhost: Apple nu acceptă http://localhost ca Return URL, deci folosim URL de producție.
 * Consecință: Apple redirecționează către producție, deci callback-ul rulează pe producție
 * și utilizatorul este înregistrat în baza de date de producție (nu în localhost).
 * Pentru a testa pe localhost cu înregistrare în baza ta locală: folosește un tunnel (ex. ngrok),
 * setează APPLE_REDIRECT_ORIGIN=https://xxx.ngrok.io și adaugă domeniul + Return URL în Apple Developer.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.APPLE_ID || process.env.APPLE_SERVICE_ID;

  const host = request.headers.get('host') || '';
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  let redirectUri: string;
  if (isLocalhost) {
    // Apple nu acceptă localhost – folosim producția sau tunnel (APPLE_REDIRECT_ORIGIN)
    const prodOrigin = process.env.APPLE_REDIRECT_ORIGIN || 'https://www.gobid.ro';
    redirectUri = `${prodOrigin.replace(/\/$/, '')}/api/auth/apple/callback`;
  } else if (process.env.NEXT_PUBLIC_SITE_URL) {
    redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/apple/callback`;
  } else {
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    redirectUri = `${protocol}://${host}/api/auth/apple/callback`;
  }

  return NextResponse.json({
    clientId: clientId || '',
    redirectUri,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
  });
}
