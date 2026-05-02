# Listings cache – TTFB and CDN

## Expected TTFB improvement

- **Server-rendered `/ro` (first paint):** Initial listings come from `getListingsCached()` (Next `unstable_cache`, revalidate 30s). On cache hit, TTFB can drop from ~200–800 ms (DB round-trip) to ~50–150 ms (in-process cache). First request after revalidate still hits the DB.
- **API `/api/ro/listings` (unauthenticated):** Responses are CDN-cacheable (`s-maxage=30, stale-while-revalidate=300`). Edge cache hits avoid the Node function and DB; TTFB can be &lt;100 ms from edge. After 30s the edge revalidates in the background (stale-while-revalidate 300s).

## Cache hit behavior

- **Page cache:** Key is built from whitelisted params only: `q`, `category`, `county`, `city`, `sort`, `page`, `limit`, `scope`. Same normalized params → same cache entry. `q` is normalized (trim, lower, diacritics stripped). Limit capped at 30, page at 200.
- **API cache:** Only unauthenticated requests are cached. If the request has `executari_access`, `next-auth.session-token`, or `authjs.session-token` cookie, `Cache-Control: no-store` is used and the response is not cached at the edge.
- **Load-more:** Client still calls `/api/ro/listings?from=...`; those responses are cached per URL (including `from`), so repeated “load more” for the same filters can hit CDN until revalidate.

## Vercel caveats

1. **`unstable_cache`:** Cache is per-instance (serverless function memory). Different invocations may not share cache; cache is not shared across regions. For consistent shared cache, the API route + CDN (`s-maxage` / `stale-while-revalidate`) gives better hit rates.
2. **Function `maxDuration: 30`:** Set in `vercel.json` for `app/api/**`. Ensures long-running listing queries (e.g. heavy filters) can finish; avoid raising this without need (cost and timeouts).
3. **Streaming:** `/ro` uses Suspense so the shell can stream; the initial listings are still fetched in the server component. Fast TTFB comes from cached `getListingsCached()` and from CDN for the API when used by the client.
4. **ISR/revalidate:** Page uses `getListingsCached` with `revalidate: 30`. On Vercel, each serverless run has its own cache; high traffic can still hit the DB often. Rely on API route Cache-Control for edge caching of JSON.
