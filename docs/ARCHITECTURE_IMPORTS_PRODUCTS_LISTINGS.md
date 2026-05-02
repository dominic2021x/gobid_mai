# Architecture Overview (Imports → Products → Listings)

Last updated: 2026-02-20

## 1. Goals / Non-goals

Goals:
- Single source of truth for listings served to users: `public.products`
- Server-side filtering + offset-based pagination with Supabase parity
- Safe rollout path: Supabase default, Prisma behind feature flag
- Progressive fallback to avoid empty result pages (search + soft filters)

Non-goals:
- Serving listings directly from import tables (`repes_listings`, `anaf_licitatii`, etc.)
- Changing the public API response shape for `/api/ro/listings`

## 2. Data Layers

### 2.1 Import / Ingestion layer (raw source tables)
These tables represent scraped/imported data and are NOT queried by the public listings API:
- `public.repes_listings` (+ `public.repes_listing_images`) — executări publice (raw import)
- `public.licitatii_insolventa_listings` (+ images) — insolvență (raw import)
- `public.anaf_licitatii` / `public.anaf_imports` — ANAF (raw import)
(Other import tables may exist; same rule applies.)

### 2.2 Public serving layer (canonical table)
All public listings are served from:
- `public.products` (canonical)

Prisma model:
- `model products` (lowercase) → Prisma Client access: `prisma.products`

This separation ensures:
- stable API + filters, regardless of import source changes
- consistent UI behavior and pagination
- ability to moderate/curate/normalize listings before publishing

## 3. Serving Path (UI → API → Repo → DB)

### 3.1 High-level flow

UI (app/ro) 
  → GET /api/ro/listings?from=0&limit=30&...filters
    → listings repo (server-side filtering)
      → DB via Supabase (default) OR Prisma (flag)
        → Response { success, items, nextFrom, hasMore, fresh }

### 3.2 Entry point
- Endpoint: `app/api/ro/listings/route.ts`
- Repo: `lib/server/products/listingsRepo.ts`

## 4. Backend Switch (Supabase vs Prisma)

Default behavior:
- Supabase is used unless `USE_PRISMA_LISTINGS === "true"`

When Prisma is enabled:
- `/api/ro/listings` does NOT depend on `supabaseAdmin`
- Repo executes Prisma queries against `public.products`

Rationale:
- phased rollout, easy rollback
- compare results and performance safely

## 5. Pagination Contract (Offset-based, Supabase parity)

The system is strictly offset-based (not page-based).

Request:
- `from` (offset) default 0
- `limit` default 30, clamped 1..100

Response:
- `nextFrom = from + items.length`
- `hasMore = items.length === limit`

Note:
- `hasMore` can be true on the last full page (edge case), same as Supabase legacy behavior.
  Client will request once more and receive `items=[]` and `hasMore=false`.

## 6. Filters and Search Semantics (Server-side)

Filters are parsed in the route and passed to the repo.
Repo constructs the database query via:
- `buildWhere(params)`
- `buildOrderBy(sort)`

Search (`q`) semantics:
- split into words
- AND across words
- each word matches OR across these fields:
  `title`, `category`, `subcategory`, `category_level_3`, `brand`, `slug`

## 7. Progressive Fallback (Avoid empty result pages)

Repo attempts a strict query first, then relaxes in steps until it finds results:

A) Search relax:
- first 1 word → first 2 words → `q` normalized (without diacritics)

B) Soft filter removal (in order):
- color → condition → size → brand

C) Structural relax:
- drop city, then drop subcategory (keep county/category)

D) Minimal:
- only `q` + scope/status (product_type, sale_type, status)

Fallback exists only inside repo logic; public API response shape stays unchanged.

## 8. Caching

Caching is used only when there are no filters (pure browsing).
When filters are present, results are always fresh from the repo.

## 9. Prisma CLI / DATABASE_URL (Operational note)

Prisma CLI reads env via Node dotenv behavior, typically `.env` only.
If `.env.local` contains the correct Supabase DB URL, load it explicitly (or set DATABASE_URL in shell).

See: `ADMIN_IMPORTS_SHARED.md` for the env loading decision and mitigation.

## 10. Related docs

- `docs/FILTERS_RO.md` — full filters and `/api/ro/listings` contract
- `docs/ADMIN_IMPORTS_SHARED.md` — import pipelines + env/prisma operational notes
- `docs/ADMIN_IMPORT_EXECUTARI_PUBLICE.md` — REPES import pipeline
- `docs/ADMIN_IMPORT_LICITATII_PUBLICE.md` — licitații import pipeline
