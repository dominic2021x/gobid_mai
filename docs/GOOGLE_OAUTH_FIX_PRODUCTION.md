# Google OAuth Login Fix – gobid.ro Production

## Auth system: Custom OAuth (Supabase fallback)

The "Continuă cu Google" button uses **custom Google OAuth** when `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set:

1. Client redirects to `https://accounts.google.com/o/oauth2/v2/auth` with `redirect_uri`
2. Google redirects back to `/api/auth/google/callback` with `?code=...`
3. Server exchanges code for tokens using the **same** `redirect_uri`

**redirect_uri mismatch** between client, server, and Google Console causes login to fail.

---

## Exact redirect_uri used in production

```
https://www.gobid.ro/api/auth/google/callback
```

To see the value in prod logs (Vercel), trigger a Google login and check logs for:

```
[Google OAuth] redirect_uri used in prod: https://www.gobid.ro/api/auth/google/callback
```

---

## Code diffs applied

### 1. `app/(site)/auth/page.tsx` – use canonical site URL for redirect_uri

**Problem:** Client used `window.location.origin`, while server used `NEXT_PUBLIC_SITE_URL`. If they differed (e.g. `gobid.ro` vs `www.gobid.ro`), token exchange failed.

**Fix:** Client uses `NEXT_PUBLIC_SITE_URL` when set so both sides use the same canonical URL.

```diff
  const initiateCustomGoogleAuth = async () => {
    try {
      debugLog('🔄 Using custom Google OAuth flow (fallback)');
      
-     // Get Google Client ID from environment or API
-     let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
-     let redirectUri = `${window.location.origin}/api/auth/google/callback`;
+     // Use canonical site URL when set - MUST match server callback and Google Console
+     const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || window.location.origin;
+     const canonicalRedirectUri = `${baseUrl}/api/auth/google/callback`;
+
+     // Get Google Client ID from environment or API
+     let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
+     let redirectUri = canonicalRedirectUri;
```

### 2. `app/api/auth/google/callback/route.ts` – log redirect_uri

**Purpose:** Make it easy to confirm the exact redirect_uri used in production.

```diff
+     // IMPORTANT: redirect_uri must EXACTLY match Google Console and client auth URL
+     console.log('[Google OAuth] redirect_uri used in prod:', redirectUri);
     console.log('🔧 OAuth Callback Config:', {
```

---

## Vercel env vars (required)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.gobid.ro` |
| `GOOGLE_CLIENT_ID` | Your OAuth Client ID from Google |
| `GOOGLE_CLIENT_SECRET` | Your OAuth Client Secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same as `GOOGLE_CLIENT_ID` (optional; if omitted, client fetches from API) |

`NEXT_PUBLIC_SITE_URL` must be `https://www.gobid.ro` because:

- `vercel.json` redirects `gobid.ro` → `https://www.gobid.ro`
- Canonical domain is `www.gobid.ro`
- Google Console must have `https://www.gobid.ro/api/auth/google/callback` as authorized redirect URI

---

## Google Cloud Console – Authorized redirect URIs

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Edit the OAuth 2.0 Client ID used for gobid.ro.
3. Add in **Authorized redirect URIs**:
   ```
   https://www.gobid.ro/api/auth/google/callback
   ```
4. For local development, also add:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
5. Save changes.

---

## Domain redirect (already configured)

`vercel.json` already redirects `gobid.ro` → `https://www.gobid.ro`:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "gobid.ro" }],
      "destination": "https://www.gobid.ro/$1",
      "permanent": true
    }
  ]
}
```

---

## Summary checklist

- [ ] Vercel: `NEXT_PUBLIC_SITE_URL=https://www.gobid.ro`
- [ ] Vercel: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set
- [ ] Google Cloud: redirect URI `https://www.gobid.ro/api/auth/google/callback` added
- [ ] Redeploy on Vercel after env changes
- [ ] Verify in prod logs: `[Google OAuth] redirect_uri used in prod: https://www.gobid.ro/api/auth/google/callback`
