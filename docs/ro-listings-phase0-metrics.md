# Phase 0 — metrics baseline (/ro)

Run the SQL in `ro-listings-phase0-diagnostics.sql` on the target database (staging first).

## Before/after table (fill per release)

| Endpoint / scenario | p50 ms (server) | p95 ms | Notes |
|---------------------|-----------------|--------|-------|
| `GET /api/ro/listings` default home | | | |
| `GET /api/ro/listings` + locality | | | |
| Count (legacy exact RPC) | | | |
| Count estimate RPC | | | |

## How to measure p50/p95

- **Sentry**: transaction duration for route `/api/ro/listings` (or custom measurement around handler).
- **Vercel / platform logs**: parse `x-vercel-id` + response time.
- **App**: temporary `console.time` in `app/api/ro/listings/route.ts` when `DEBUG_LISTINGS=1`.

After schema changes, run `ANALYZE public.products;` (included as comment in the SQL file).
