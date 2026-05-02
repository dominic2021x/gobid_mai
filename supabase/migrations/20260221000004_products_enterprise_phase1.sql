-- ============================================
-- Phase 1: Products Enterprise – Extensions + Additive Columns
-- ============================================
-- Safe to run in transaction (Supabase migrations).
-- Indexes are in a SEPARATE file (run manually with CONCURRENTLY).
--
-- Run order:
--   1. This file (via supabase db push or migration)
--   2. 20260221_products_enterprise_phase1_indexes_concurrent.sql (manually, see instructions)
--
-- Extensions: pg_trgm (trigram for ILIKE), unaccent (diacritics)

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Additive columns (nullable, no default – backfill in Phase 2)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_norm TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_norm TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory_norm TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS county_norm TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS city_norm TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_text TEXT;

COMMENT ON COLUMN public.products.brand_norm IS 'Normalized brand: lower(unaccent(brand))';
COMMENT ON COLUMN public.products.category_norm IS 'Normalized category: lower(unaccent(category))';
COMMENT ON COLUMN public.products.subcategory_norm IS 'Normalized subcategory: lower(unaccent(subcategory))';
COMMENT ON COLUMN public.products.county_norm IS 'Normalized county: lower(unaccent(county))';
COMMENT ON COLUMN public.products.city_norm IS 'Normalized city: lower(unaccent(city))';
COMMENT ON COLUMN public.products.search_text IS 'Concatenated normalized search text (title+category+subcategory+brand+slug)';
