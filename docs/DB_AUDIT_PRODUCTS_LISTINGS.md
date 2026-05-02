# DB Audit: public.products – Performance & Enterprise Readiness

**Date:** 2026-02-21  
**Scope:** Canonical table `public.products` for listings + suggestions. No API shape changes.

---

## 1. Inspection Summary

### 1.1 Schema (products model)

| Field | Type | Filtered | Sorted | Search (q) | Suggestions |
|-------|------|----------|--------|------------|-------------|
| id | UUID | - | - | - | - |
| title | String | - | - | contains | ilike |
| slug | String | - | - | contains | - |
| category | String | equals | - | contains | ilike |
| subcategory | String | equals | - | contains | ilike |
| category_level_3 | String | equals | - | contains | - |
| county | String | contains | - | - | - |
| city | String | contains | - | - | - |
| product_location | String | - | - | - | - |
| brand | String | equals/in | - | contains | - |
| size | String | equals/in | - | - | - |
| color | String | equals/in | - | - | - |
| condition | String | equals/in | - | - | - |
| starting_price_ron | Decimal | gte/lte | asc/desc | - | - |
| product_type | String | equals | - | - | - |
| sale_type | String | equals | - | - | - |
| status | String | in | - | - | - |
| created_at | DateTime | - | desc/asc | - | - |
| custom_fields | Json | - | - | - | - |

**custom_fields:** Selected in response; NOT filtered in listings. GIN index exists. No jsonb path indexes needed for current use.

### 1.2 Query Patterns

| Pattern | Source | Operators | Frequency |
|---------|--------|-----------|-----------|
| Default listing | listingsRepo Supabase | status IN, order created_at desc | High |
| Filtered listing | listingsRepo Prisma | status + category/subcategory/level3/county/city/brand/size/color/condition/price/product_type/sale_type | Medium |
| Search (q) | listingsRepo Prisma | AND(words) × OR(title, category, subcategory, category_level_3, brand, slug) contains | Medium |
| Suggestions | suggestions route | title/description/category/subcategory ilike %q% | High |
| Filter counts | filter-counts route | status IN, category/subcategory select | Low |

### 1.3 Existing Indexes (from schema)

- idx_products_status
- idx_products_category (category, subcategory)
- idx_products_category_level3 (category, subcategory, category_level_3)
- idx_products_brand, idx_products_color, idx_products_condition, idx_products_size
- idx_products_auction_date
- idx_products_custom_fields (GIN)
- idx_products_lp_scope (partial: product_type/sale_type)
- idx_products_premium, idx_products_premium_active (partial)

**Missing:** Composite (status, created_at), pg_trgm for ILIKE, county/city for contains, starting_price_ron for range.

---

## 2. Performance-Focused Index Proposals

### 2.1 Default listing (status + created_at desc)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_status_created_at
ON public.products (status, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);
```

**Rationale:** Supabase default path filters `status IN (...)` and orders by `created_at DESC`. Partial index avoids deleted/draft rows.

### 2.2 Filters (category, county, city, price)

```sql
-- Category hierarchy (already exists, verify)
-- idx_products_category, idx_products_category_level3

-- County/city: contains (ILIKE) – needs pg_trgm
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_county_trgm
ON public.products USING gin (county gin_trgm_ops)
WHERE county IS NOT NULL AND county <> '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_city_trgm
ON public.products USING gin (city gin_trgm_ops)
WHERE city IS NOT NULL AND city <> '';

-- Price range (for price_min/price_max)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_starting_price_ron
ON public.products (starting_price_ron)
WHERE starting_price_ron IS NOT NULL;
```

### 2.3 Search (q) – ILIKE contains on multiple fields

**Option A: pg_trgm per field (recommended for current OR-across-fields pattern)**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_title_trgm
ON public.products USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_slug_trgm
ON public.products USING gin (slug gin_trgm_ops)
WHERE slug IS NOT NULL;
```

**Option B: Full-text (tsvector) with unaccent – for Phase 3 cutover**

```sql
-- Add column: search_tsv tsvector
-- Index: GIN(search_tsv)
-- Populate: to_tsvector('simple', unaccent(title || ' ' || category || ...))
```

For Phase 1, use pg_trgm. Full-text can be added in Phase 3 if ILIKE remains slow at scale.

### 2.4 Suggestions (prefix/contains)

Same ILIKE pattern. pg_trgm indexes on title, category, subcategory will help. Suggestions also query description – add:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_description_trgm
ON public.products USING gin (description gin_trgm_ops)
WHERE description IS NOT NULL;
```

**Note:** GIN trigram indexes can be large. Prioritize title (most selective). Description optional if table is huge.

### 2.5 Composite for filtered + sorted listing

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_listing_filtered
ON public.products (status, category, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);
```

---

## 3. Data-Quality Normalization Plan

### 3.1 Canonicalization Rules

| Field | Rule | Example |
|-------|------|---------|
| brand | lowercase, strip diacritics | "Jaguar" → "jaguar" |
| category | lowercase, strip diacritics | "Autovehicule" → "autovehicule" |
| subcategory | lowercase, strip diacritics | "Autoturisme" → "autoturisme" |
| category_level_3 | lowercase, strip diacritics | - |
| county | lowercase, strip diacritics | "București" → "bucuresti" |
| city | lowercase, strip diacritics | "Iași" → "iasi" |
| color | lowercase, strip diacritics | - |
| condition | lowercase, strip diacritics | - |
| size | lowercase (or controlled vocab) | - |

### 3.2 Storage Strategy

**Additive columns (Phase 1):**

- `brand_norm` TEXT – normalized brand
- `category_norm` TEXT – normalized category
- `subcategory_norm` TEXT – normalized subcategory
- `county_norm` TEXT – normalized county
- `city_norm` TEXT – normalized city
- `search_text` TEXT – concatenation of title + category + subcategory + brand + slug (normalized, for search)
- `search_tsv` TSVECTOR – optional full-text vector (Phase 3)

**Rationale:** New columns allow indexed equality/prefix without changing app reads initially. Cutover in Phase 3.

### 3.3 Sync Strategy

- **Backfill:** Batch SQL updates (see Phase 2 migration).
- **Ongoing:** Application write path (publish/import) must set `*_norm` when inserting/updating. Add trigger as fallback for legacy writes:

```sql
CREATE OR REPLACE FUNCTION products_normalize_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.brand_norm := lower(unaccent(COALESCE(NEW.brand, '')));
  NEW.category_norm := lower(unaccent(COALESCE(NEW.category, '')));
  -- ... etc
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Migration Plan (Phases)

### Phase 1: Extensions + additive columns (only)

- Enable `pg_trgm` and `unaccent` extensions.
- Add `*_norm` and `search_text` columns (nullable).
- No indexes in this file (transaction-safe).

### Phase 1b: Indexes (CONCURRENTLY – run manually)

- Run `20260221_products_enterprise_phase1_indexes_concurrent.sql` outside transaction.
- See run instructions in that file.

### Phase 2: Backfill scripts (batch SQL)

- Update `*_norm` and `search_text` in batches of 1000–5000.
- Run during low traffic.
- Verify row counts.

### Phase 3: Switch queries to new columns (optional, later)

- Change Prisma/Supabase filters to use `category_norm` etc. for equality.
- Use `search_tsv` for full-text if implemented.
- Requires application code changes (out of scope for this audit).

### Phase 4: Cleanup / constraints

- Add CHECK constraints where safe.
- Consider NOT NULL on `*_norm` for new rows (after backfill).

---

## 5. Verification Steps

### 5.1 EXPLAIN ANALYZE – Listings default (status + created_at)

Matches: Supabase path in `listingsRepo.getRoListingsSupabase` and Prisma path with no filters.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, slug, url, images, category, subcategory, category_level_3,
       size, brand, color, condition, starting_price, starting_price_ron, starting_price_eur,
       product_type, sale_type, status, county, city, product_location, auction_date,
       custom_fields, created_at, is_premium, premium_until
FROM public.products
WHERE status IN ('active','reserved','sold','in_progress')
  AND status <> 'deleted'
ORDER BY created_at DESC
LIMIT 30;
```

**Expected:** Index Scan on `idx_products_status_created_at` (or Seq Scan if index not yet created). After Phase 1 indexes: `Index Scan using idx_products_status_created_at`.

### 5.2 EXPLAIN ANALYZE – Listings with filters (category + county + q)

Matches: Prisma path in `listingsRepo.buildWhere` with category, county, city, and search q.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, slug, url, images, category, subcategory, category_level_3,
       size, brand, color, condition, starting_price_ron, status, county, city,
       product_location, auction_date, custom_fields, created_at, is_premium, premium_until
FROM public.products
WHERE status IN ('active','reserved','sold','in_progress')
  AND (
    (title ILIKE '%jaguar%' OR category ILIKE '%jaguar%' OR subcategory ILIKE '%jaguar%'
     OR category_level_3 ILIKE '%jaguar%' OR brand ILIKE '%jaguar%' OR slug ILIKE '%jaguar%')
  )
  AND category ILIKE '%autovehicule%'
  AND county ILIKE '%bucuresti%'
ORDER BY created_at DESC
LIMIT 30;
```

**Expected:** Bitmap Index Scan on `idx_products_title_trgm` (or similar GIN trigram), or Bitmap Heap Scan combining multiple index scans.

### 5.3 EXPLAIN ANALYZE – Suggestions (prefix q)

Matches: `app/api/search/suggestions` – `title.ilike.%q%`, `description.ilike.%q%`, `category.ilike.%q%`, `subcategory.ilike.%q%`.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, category, subcategory
FROM public.products
WHERE (
  title ILIKE '%jagu%' OR
  description ILIKE '%jagu%' OR
  category ILIKE '%jagu%' OR
  subcategory ILIKE '%jagu%'
)
AND title IS NOT NULL
LIMIT 50;
```

**Expected:** Bitmap Index Scan on `idx_products_title_trgm` or `idx_products_description_trgm`. Target: execution time < 100ms.

### 5.4 Latency targets

| Endpoint | Target p95 |
|----------|------------|
| GET /api/ro/listings (no filters) | < 200ms |
| GET /api/ro/listings (with filters) | < 500ms |
| GET /api/search/suggestions | < 100ms |

### 5.5 Index usage check (post-rollout)

```sql
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'products'
ORDER BY idx_scan DESC;
```

---

## 6. Files Added (DO NOT APPLY YET)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260221_products_enterprise_phase1.sql` | Extensions + additive columns only (transaction-safe) |
| `supabase/migrations/20260221_products_enterprise_phase1_indexes_concurrent.sql` | Indexes with CONCURRENTLY – run manually outside transaction |
| `supabase/migrations/20260221_products_enterprise_phase2_backfill.sql` | Batch backfill of _norm and search_text |
| `supabase/migrations/20260221_products_enterprise_phase2_trigger.sql` | Trigger to keep _norm in sync on INSERT/UPDATE |

**Run order:** Phase 1 → Phase 1b (indexes, manually) → Phase 2 backfill (repeat until done) → Phase 2 trigger.

**Note:** If `unaccent` is in schema `extensions`, replace `public.unaccent` with `extensions.unaccent` in backfill and trigger.
