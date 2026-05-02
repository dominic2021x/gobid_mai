# Enterprise image pipeline (AVIF master + CF Resizing + signed delivery)

## Cost / storage (before vs after)

| Area | Before (3× WebP on R2) | After (1× AVIF/WebP + CF) |
|------|-------------------------|----------------------------|
| R2 storage per logical image | ~3× object size (thumb+card+full) | ~1× master (~30–50% smaller than WebP at same visual quality) |
| R2 Class A/B ops | 3 PUTs / image | 1 PUT / image |
| Egress | Full bytes from R2 per variant if not using transforms | One origin fetch per cache-miss at CF Image Resizing; edge caches by URL |
| Compute | Sharp ×3 encodes per upload | Sharp ×1 encode; CF does resize (billed per CF plan / Images) |

**Rule of thumb:** storing only the master cuts **~2/3** of R2 object count for the same catalog; AVIF typically saves **25–45%** vs WebP at similar quality. Cloudflare Image Resizing adds **per-request** cost on the zone — offset by fewer stored objects and stronger edge cache.

## Latency (cold vs warm)

- **Cold:** Node + Sharp first load adds ~50–300ms; not included in `encodeMs` JSON (Sharp-only).
- **Warm:** `encodeMs` tracks AVIF/WebP encode; `processingMs` includes SHA-256, single R2 PUT, DB insert.
- **Delivery:** `GET /api/image/deliver` is **edge** → **302** to `/cdn-cgi/image/...` (no byte proxy in Next).

## Env

| Variable | Purpose |
|----------|---------|
| `IMAGE_DELIVERY_SECRET` | HMAC for `/api/image/deliver` (≥16 chars). Required for signed URLs. |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | Cloudflare zone origin for R2 + Image Resizing (same as today). |
| `NEXT_PUBLIC_SITE_URL` | Absolute signed delivery links in API responses. |

## Dedupe

`content_hash` is **globally unique** among active rows (`deleted_at IS NULL`). Same bytes uploaded by different users map to one R2 object and one metadata row.
