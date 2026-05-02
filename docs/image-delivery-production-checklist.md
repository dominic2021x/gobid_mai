# Image delivery — production validation checklist

Use this before and after switching **Cloudflare Worker** to the primary delivery layer (`NEXT_PUBLIC_IMAGE_DELIVERY_URL`).

## Configuration

- [ ] `IMAGE_DELIVERY_SECRET` set (≥16 chars), same value on Next.js **and** Worker.
- [ ] `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` points at the **same** host Cloudflare uses for `/cdn-cgi/image/`.
- [ ] `NEXT_PUBLIC_IMAGE_DELIVERY_URL` set to the Worker (or canonical app URL), e.g. `https://img.example.com/api/image/deliver`.
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` set in production for distributed rate limits (upload + delivery).
- [ ] `IMAGE_DELIVERY_METRICS` left unset or `1`; use `0` only if logs must be quiet.

## Functional checks

- [ ] Upload returns signed URLs whose `deliveryBaseUrl` matches the configured delivery origin.
- [ ] `GET` with valid `hash`, `w`, `dpr`, `exp`, `ext`, `sig` returns `200` and correct `Content-Type` (`image/avif` | `image/webp` | `image/jpeg` only).
- [ ] Non-canonical query order triggers **308** to canonical order (`dpr` → `exp` → `ext` → `hash` → `sig` → `w`).
- [ ] Expired / invalid `exp` returns **401** / **400** as implemented.
- [ ] When CF Image Resizing fails, response includes `X-Image-Delivery-Fallback: r2` and `X-Image-Delivery-Fallback-Reason: timeout | error` (and `X-Image-Delivery-Fallback-Http-Status` when transform returned HTTP error).

## Observability (structured logs)

Logs contain JSON lines with `"s":"image_delivery_v1"`. Aggregate in your log stack:

| Metric / KPI | How to derive |
|----------------|----------------|
| **TTL clamp rate** | `kind === "signed_url_mint"` and `ttlClamped === true` → count; divide by all `signed_url_mint` events. |
| **Fallback rate** | `kind === "deliver_response"` and `usedFallback === true` → count; divide by all `deliver_response`. |
| **Cache hit ratio (transform upstream)** | For `deliver_response` with `usedFallback === false`, `upstreamCfCacheStatus === "HIT"` (or `DYNAMIC` / `MISS` per your CF setup) → HIT / (HIT+MISS) on that dimension. |
| **MIME mismatch** | `upstreamMismatch === true` on `deliver_response` (investigate origin / CF). |

Example filter (conceptual): `json.s = "image_delivery_v1" AND json.kind = "deliver_response"`.

## Load / smoke

- [ ] `curl -sI` against a signed URL: `CDN-Cache-Control`, `Cache-Tag`, `Cache-Control` present.
- [ ] Spot-check TTFB from two regions (Worker vs Next Edge) if you still run both.

## Rollback

- [ ] Unset or repoint `NEXT_PUBLIC_IMAGE_DELIVERY_URL` to the Next.js origin; redeploy app so new uploads mint app-hosted URLs.
