-- ============================================
-- Phase 1b: Indexes (VARIANT for SQL Editor)
-- ============================================
-- Use this file when SQL Editor gives "cannot run inside transaction block".
-- Uses regular CREATE INDEX (no CONCURRENTLY) - CAN run in transaction.
--
-- TRADEOFF: Table is locked briefly during each index creation.
-- For staging or small tables: fine. For production with 100k+ rows: prefer
-- running 20260221_products_enterprise_phase1_indexes_concurrent.sql via psql.
--
-- You can run this ENTIRE file at once in SQL Editor.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_status_created_at
ON public.products (status, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);

CREATE INDEX IF NOT EXISTS idx_products_starting_price_ron
ON public.products (starting_price_ron)
WHERE starting_price_ron IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
ON public.products USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_slug_trgm
ON public.products USING gin (slug gin_trgm_ops)
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
ON public.products USING gin (description gin_trgm_ops)
WHERE description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_county_trgm
ON public.products USING gin (county gin_trgm_ops)
WHERE county IS NOT NULL AND county <> '';

CREATE INDEX IF NOT EXISTS idx_products_city_trgm
ON public.products USING gin (city gin_trgm_ops)
WHERE city IS NOT NULL AND city <> '';

CREATE INDEX IF NOT EXISTS idx_products_listing_filtered
ON public.products (status, category, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);

CREATE INDEX IF NOT EXISTS idx_products_brand_norm
ON public.products (brand_norm)
WHERE brand_norm IS NOT NULL AND brand_norm <> '';

CREATE INDEX IF NOT EXISTS idx_products_category_norm
ON public.products (category_norm)
WHERE category_norm IS NOT NULL AND category_norm <> '';

CREATE INDEX IF NOT EXISTS idx_products_subcategory_norm
ON public.products (subcategory_norm)
WHERE subcategory_norm IS NOT NULL AND subcategory_norm <> '';
