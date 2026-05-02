# Enterprise image delivery — final (Edge proxy)

## Behavior (current)

| Topic | Implementation |
|--------|------------------|
| **Proxy** | `GET /api/image/deliver` streams Cloudflare Image Resizing bytes (no 302). |
| **Cache key** | Explicit **avif / webp / jpeg** from `Accept` via `pickCdnOutputFormatFromAccept` (with `normalizeAcceptHeader`) → **no `Vary: Accept`** on the response. |
| **Headers** | **Browser:** `Cache-Control: public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400`. **Edge:** `CDN-Cache-Control: public, max-age=31536000, immutable`. **`Cache-Tag`** for purge API. |
| **Timeout** | Upstream transform fetch **7s**; direct-origin fallback uses the **same** timeout. |
| **Fallback** | If transform fails or times out, fetch **direct R2 public URL** for the master object. Headers: **`X-Image-Delivery-Fallback: r2`**, **`X-Image-Delivery-Fallback-Reason: timeout \| error`**, optional **`X-Image-Delivery-Fallback-Http-Status`** when transform returned HTTP error. |
| **HMAC `exp`** | **±120s** clock skew; reject `exp` **> ~400 days** in the future (`delivery-exp-validation.ts`). |
| **Signed URL TTL** | **Clamped** at mint time: `DELIVERY_MIN_SIGNED_TTL_SEC` … `DELIVERY_MAX_SIGNED_TTL_SEC` (`delivery-ttl.ts`); upload API returns **`ttlSeconds`** = applied value. |
| **Rate limit** | **180 req / min / IP** — **Upstash Redis** when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set; otherwise in-memory fallback (`delivery-rate-limit.ts`). |
| **Widths / DPR** | **300, 600, 1200** × **dpr 1 or 2**; HMAC v2 (v1 verify when `dpr === 1`). |
| **Panorama upload** | Long edge **≥ 2:1** aspect: resize **width-only** or **height-only** 1200px; else **inside** 1200×1200. |
| **JPEG** | **Only** if AVIF **and** WebP encode both fail (upload pipeline). |
| **pHash (optional)** | Stub `lib/image/perceptual-hash-async.ts` + `PERCEPTUAL_HASH_QUEUE_ENABLED` — queue not wired. |

## Edge vs Cloudflare Worker (latency)

| Path | Typical extra hops | Notes |
|------|--------------------|--------|
| **Browser → Vercel Edge (`/api/image/deliver`) → CF Images → R2** | Customer → Vercel POP → (optional) origin logic → CF | Fallback when Worker is unavailable; minted URLs use `NEXT_PUBLIC_IMAGE_DELIVERY_URL` when set. |
| **Browser → Worker (primary) → CF Images → R2** | Customer → CF edge only | Set **`NEXT_PUBLIC_IMAGE_DELIVERY_URL`** to the Worker delivery URL so uploads mint Worker links. Often **~20–120 ms** lower **TTFB** vs Vercel Edge. |

Reference implementation: `workers/image-delivery-proxy.example.js` (keep in sync with `app/api/image/deliver/route.ts` when behavior changes).

### Observability

Structured JSON logs (`"s":"image_delivery_v1"`) from **`lib/image/delivery-metrics.ts`**: TTL mint clamps, delivery responses (fallback + `upstreamCfCacheStatus`), canonical redirects. Production checklist: [image-delivery-production-checklist.md](./image-delivery-production-checklist.md).

### Cache hit ratio (estimation)

| Layer | What drives hits | Rough expectation |
|-------|------------------|-------------------|
| **Browser** | Same signed URL + `max-age=86400` + SWR | High for repeat sessions; new signed URLs after expiry are misses until re-fetched. |
| **CDN (CF)** | `CDN-Cache-Control` immutable + stable URL (hash, `w`, `dpr`, `exp`, `sig`, explicit format in upstream request) | **Very high** for warm images (listing grids); cold images pay one transform then stay hot. |
| **Without** explicit format | Historical: `Vary: Accept` or `format=auto` fragmentation | Lower hit ratio — **avoided** by server-side Accept negotiation. |

**Rule of thumb:** after warm-up, **edge cache hit ratio** for popular listing images often lands in **85–98%** (varies by catalog churn and TTL). Instrument `CF-Cache-Status` / `Age` in staging to validate.

## Distributed rate limiting

**Production:** set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (same as upload limits). Keys: `img:deliver:<ip>`.

**Alternative on pure Worker-only stacks:** colocate a **fixed-window** counter in **Cloudflare KV** (eventual consistency — acceptable for abuse prevention) or **Durable Objects** (strong consistency). The example Worker uses Upstash for parity with Next.js.

## Performance benchmarks (before → after)

| Metric | Before (auto + Vary + 15s) | After (explicit format + SWR + stale-if-error + 7s) |
|--------|----------------------------|-------------------------------------|
| **CDN hit ratio** | Lower (Accept fragmentation) | Higher (one negotiated variant per URL) |
| **Browser reuse** | Long immutable only | **SWR 7d** + **stale-if-error 1d** on 5xx |
| **Tail latency** | Up to 15s wait | Capped **7s** per hop; **fallback** to direct file |
| **Abuse** | Unlimited GETs | **180/min/IP** (Redis when configured) |

## Cost impact

| Area | Effect |
|------|--------|
| **CF Images** | Same transform count; explicit `format=` may shift AVIF vs WebP mix slightly. |
| **Vercel Edge** | Browser/CDN caching reduces repeat origin work; Redis RL adds negligible cost vs abuse. |
| **Worker** | Per-request pricing; often offset by lower Vercel Edge duration on image-heavy routes if you migrate. |

## Env

- `IMAGE_DELIVERY_SECRET` — HMAC secret (≥16 chars).
- `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` — origin for `/cdn-cgi/image/` and direct fallback.
- `NEXT_PUBLIC_SITE_URL` — site origin (auth, HTML).
- `NEXT_PUBLIC_IMAGE_DELIVERY_URL` — **Worker / delivery entry** for signed URLs (e.g. `https://img.example.com/api/image/deliver`).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — optional but **recommended** in production for delivery RL.
- `IMAGE_DELIVERY_METRICS` — set `0` to disable structured delivery logs.
- `PERCEPTUAL_HASH_QUEUE_ENABLED=true` — reserved for future queue (optional).

## R2: CORS pentru încărcare din browser (presigned PUT)

Dacă în consolă apare **„Cerere CORS eșuată”** / **„Access-Control-Allow-Origin lipsă”** pe domeniul `*.r2.cloudflarestorage.com`, browserul blochează **PUT**-ul la URL-ul presignat. Fluxul preferat rămâne **proxy** same-origin (`POST /api/upload` multipart), dar fallback-ul folosește PUT direct — fără CORS pe bucket, fallback-ul eșuează.

În **Cloudflare Dashboard → R2 → bucket → Settings → CORS policy**, adaugă reguli care permit originea site-ului (și `http://localhost:3000` pentru dev), de exemplu:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://localhost:3000",
      "https://gobid.ro",
      "https://www.gobid.ro"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Ajustează `AllowedOrigins` la domeniile tale. După salvare, reîncearcă încărcarea.

**Notă:** Avertismentele Firefox despre `-webkit-text-size-adjust`, `:host:not(button)` sau `global` în fișiere CSS generate (Tailwind / auth) sunt în general **benigne** și nu blochează încărcările.
