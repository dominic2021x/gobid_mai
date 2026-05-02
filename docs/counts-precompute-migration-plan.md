# Counts Precompute Migration Plan

## Goal

Move `filter-counts` and the heaviest count paths off live scans of `public.products`, so Supabase pool pressure stays low even during imports or burst traffic.

## Phase 1

Deploy shared cache + version invalidation:

- `lib/server/sharedRedis.ts`
- `lib/server/sharedTtlCache.ts`
- `lib/server/products/derivedDataVersion.ts`
- `lib/server/products/invalidateDerivedCaches.ts`

This is already safe before DB migration.

## Phase 2

Apply migration:

- `supabase/migrations/20260424113000_product_filter_counts_rollup.sql`
- `supabase/migrations/20260424124500_product_filter_counts_incremental_refresh.sql`

Then run once:

```sql
select * from public.rebuild_product_filter_counts_rollup();
```

Steady-state refresh:

```sql
select * from public.refresh_product_filter_counts_rollup(500);
```

Optional cron:

- every 15-60 seconds, or
- after each import batch / bulk admin update

## Phase 3

Use rollup as primary source for `GET /api/ro/filter-counts`.

The route already prefers `public.product_filter_counts_rollup` and falls back to the legacy scan path if the table is not present yet or the rollup has not been rebuilt yet.

After the incremental migration:

- `products` writes update `product_filter_counts_source` via trigger
- affected aggregate groups are queued in `product_filter_counts_dirty_groups`
- refresh only recomputes queued groups, not the whole dataset

## Listings Count

`/api/ro/listings-count` is now protected by shared cache + version invalidation, but strict counts are still request-time DB work on cold miss.

Recommended next DB step:

1. Add a query-result cache table for common strict count signatures.
2. Store:
   - normalized query signature
   - total count
   - refreshed_at
3. Warm the most common signatures:
   - homepage default
   - `category=autovehicule`
   - `subcategory=piese-auto`
   - `scope=executari`

## Index Suggestions

If `countProducts()` still falls back to base table often, validate these composite indexes exist and are used:

```sql
create index if not exists products_count_channel_status_category_subcategory_idx
  on public.products (channel, status, category, subcategory);

create index if not exists products_count_channel_status_product_type_sale_type_idx
  on public.products (channel, status, product_type, sale_type);

create index if not exists products_count_status_sold_at_idx
  on public.products (status, sold_at desc);
```

For text search / q-heavy counts, avoid strict live count on every keystroke. Prefer:

- cached count by normalized query signature
- delayed refresh
- optional “about N results” UX for search-heavy flows
