# RO listings query performance

## Scope

- **Prisma path** (`USE_PRISMA_LISTINGS=true`): keyset pagination on the default sort path (`ORDER BY created_at DESC, id DESC`), no `OFFSET` for first page and for `cursor=` requests.
- **Supabase scan path** (default when Prisma off): still batches `range()` + in-memory filters; indexes help future RPC/raw SQL. Response includes `nextCursor: null`.

## Indexes (migration `20260418140000_products_listings_perf_indexes.sql`)

| Index | Purpose |
| --- | --- |
| `idx_products_status_category_created_id` | `(status, category, created_at DESC, id DESC)` — filters on status + category with stable sort |
| `idx_products_created_at_id_desc` | `(created_at DESC, id DESC)` — keyset / recent listings |
| `idx_products_active_created_id_partial` | Partial `WHERE status = 'active'` — smaller index for browse |

**Note:** Slugs are stored in `products.category` (there is no `category_slug` column).

**Index-only scans:** List endpoints still `SELECT` many columns (`images`, `custom_fields`, …), so PostgreSQL will usually **not** satisfy the query from the index alone (heap fetches for non-covered columns). The new indexes still avoid **sequential scans** on hot paths when the planner chooses an **Index Scan** / **Bitmap Index Scan**.

## EXPLAIN ANALYZE (run in Supabase SQL after `ANALYZE public.products;`)

### A) Keyset page (Prisma-equivalent)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, created_at
FROM public.products
WHERE status IN ('active','reserved','sold','in_progress')
  AND (channel = 'ro' OR channel = 'executari_insolventa')
ORDER BY created_at DESC, id DESC
LIMIT 31;
```

**Expect:** `Index Scan` using `idx_products_created_at_id_desc` or filtered variant — execution time goal **&lt; 100 ms** on typical prod sizes (depends on data volume and hardware).

### B) Before/after story (offset vs cursor)

| Pattern | Typical plan issue |
| --- | --- |
| **Before** | `OFFSET` large values force skipping many rows even with indexes |
| **After** | Keyset uses `(created_at, id)` predicate — stable cost per page |

### C) Regression check (no seq scan on keyset)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM public.products
WHERE status IN ('active','reserved','sold','in_progress')
ORDER BY created_at DESC, id DESC
LIMIT 31;
```

Look for **`Seq Scan on products` = undesirable** on this query at scale; after indexes + `ANALYZE`, prefer index-backed plans.

## API

- First page: unchanged query params.
- Next page: pass `cursor` from JSON `nextCursor` (opaque). When `cursor` is present, `from` is ignored server-side (`queryFromParams` forces `from: 0`).
