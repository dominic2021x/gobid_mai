/* eslint-disable no-restricted-globals */
/**
 * Minimal SW: stale-while-revalidate for /api/ro/listings (Phase 4.3).
 * Register only from /ro client when `NEXT_PUBLIC_ENABLE_RO_LISTINGS_SW=1`.
 */
const CACHE = "ro-listings-sw-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname !== "/api/ro/listings") return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    }),
  );
});
