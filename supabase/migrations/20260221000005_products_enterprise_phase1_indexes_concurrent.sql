-- ============================================
-- Phase 1b: Indexes with CONCURRENTLY (run MANUALLY)
-- ============================================
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Supabase SQL Editor runs the whole script in a transaction → ERROR 25001.
--
-- FIX: Run EACH statement BELOW in a SEPARATE execution.
--      Copy ONE block, Run, wait for success, then the next. Repeat 11 times.
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_name;
-- ============================================

-- 1/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_status_created_at
ON public.products (status, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);

-- 2/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_starting_price_ron
ON public.products (starting_price_ron)
WHERE starting_price_ron IS NOT NULL;

-- 3/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_title_trgm
ON public.products USING gin (title gin_trgm_ops);

-- 4/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_slug_trgm
ON public.products USING gin (slug gin_trgm_ops)
WHERE slug IS NOT NULL;

-- 5/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_description_trgm
ON public.products USING gin (description gin_trgm_ops)
WHERE description IS NOT NULL;

-- 6/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_county_trgm
ON public.products USING gin (county gin_trgm_ops)
WHERE county IS NOT NULL AND county <> '';

-- 7/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_city_trgm
ON public.products USING gin (city gin_trgm_ops)
WHERE city IS NOT NULL AND city <> '';

-- 8/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_listing_filtered
ON public.products (status, category, created_at DESC)
WHERE status = ANY (ARRAY['active','reserved','sold','in_progress']::text[]);

-- 9/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand_norm
ON public.products (brand_norm)
WHERE brand_norm IS NOT NULL AND brand_norm <> '';

-- 10/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_norm
ON public.products (category_norm)
WHERE category_norm IS NOT NULL AND category_norm <> '';

-- 11/11
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_subcategory_norm
ON public.products (subcategory_norm)
WHERE subcategory_norm IS NOT NULL AND subcategory_norm <> '';
