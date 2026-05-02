/**
 * Google OAuth Helper Functions
 */

export function getGoogleAuthUrl(isAdmin: boolean = false): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  const scope = 'openid email profile';
  const state = isAdmin ? 'admin' : 'user';
  
  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    access_type: 'offline',
    prompt: 'consent',
    state: state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function redirectToGoogleAuth(isAdmin: boolean = false): void {
  if (typeof window !== 'undefined') {
    const authUrl = getGoogleAuthUrl(isAdmin);
    window.location.href = authUrl;
  }
}


