# DEV-Only Cache Configuration

This document describes the DEV-only "always live" behavior implemented for localhost:3000.

## Files Changed

### 1. `app/layout.tsx`
Added DEV-only dynamic rendering and no-store fetch behavior:
- `dynamic = "force-dynamic"` in DEV, `"auto"` in production
- `fetchCache = "force-no-store"` in DEV, `"auto"` in production  
- `revalidate = 0` in DEV, `false` in production

### 2. `middleware.ts` (NEW)
Created middleware that sets no-cache headers ONLY for localhost:3000 and 127.0.0.1:3000:
- Sets `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
- Sets `Pragma: no-cache`
- Sets `Expires: 0`
- Applies to all routes via matcher `/:path*`
- Does NOT affect production/staging domains

### 3. `app/api/exchange-rate/route.ts`
Updated to use DEV-only no-store:
- DEV: `cache: 'no-store'` for external API fetches
- PROD: `next: { revalidate: 3600 }` (1 hour cache)

### 4. `app/api/romania-localities/route.ts`
Updated to bypass memory cache in DEV:
- DEV: Always reads fresh from file
- PROD: Uses in-memory cache

## Verification Checklist

### ✅ On localhost:3000
1. **Check Response Headers:**
   ```bash
   curl -I http://localhost:3000/
   ```
   Should show:
   - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
   - `Pragma: no-cache`
   - `Expires: 0`

2. **Test Refresh Behavior:**
   - Make a change to server-side code
   - Refresh browser (F5 or Cmd+R)
   - Changes should appear immediately without hard refresh

3. **Test API Routes:**
   ```bash
   curl -I http://localhost:3000/api/exchange-rate
   ```
   Should show no-cache headers

### ✅ On Production/Staging Domain
1. **Check Response Headers:**
   ```bash
   curl -I https://your-domain.com/
   ```
   Should NOT show forced no-cache headers
   - May show normal Next.js caching headers
   - Should respect Next.js defaults

2. **Verify Caching Works:**
   - API routes should use their configured cache settings
   - Exchange rate API should cache for 1 hour
   - Romania localities should use in-memory cache

### ✅ No Re-login Loops
1. **Test Auth Flow:**
   - Login on localhost:3000
   - Refresh page
   - Should remain logged in (no redirect to login)
   - Session should persist

2. **Test Session Endpoints:**
   - `/api/auth/*` routes should work normally
   - No forced cache invalidation on auth routes

## How It Works

### Development (localhost:3000)
- **Middleware:** Intercepts all requests and adds no-cache headers
- **Layout:** Forces dynamic rendering and no-store fetch
- **API Routes:** Bypass caching for external fetches and in-memory cache

### Production
- **Middleware:** Does nothing (host check fails)
- **Layout:** Uses Next.js defaults (`auto`)
- **API Routes:** Use configured caching (1 hour for exchange rate, in-memory for localities)

## Notes

- Changes are gated by `NODE_ENV === "development"` and host header checks
- Production behavior is completely unchanged
- No TypeScript build errors introduced
- Minimal changes to existing codebase
