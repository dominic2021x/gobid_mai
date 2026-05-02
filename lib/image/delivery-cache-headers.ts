/**
 * Browser: SWR + stale-if-error (serve stale on origin 5xx).
 * Cloudflare: long immutable at edge.
 */
export const DELIVERY_CACHE_CONTROL_BROWSER =
  "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400";

export const DELIVERY_CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";
