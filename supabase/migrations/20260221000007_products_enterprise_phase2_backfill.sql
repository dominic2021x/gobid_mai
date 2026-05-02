-- ============================================
-- Phase 2: Backfill normalized columns (batch)
-- ============================================
-- Run during low traffic. Uses unaccent() – requires Phase 1 extensions.
--
-- If unaccent is in schema "extensions" (Supabase): replace unaccent() with extensions.unaccent()
--
-- Run repeatedly until NOTICE shows 0 rows updated. Example:
--   psql "$DATABASE_URL" -f supabase/migrations/20260221_products_enterprise_phase2_backfill.sql
-- ============================================

DO $$
DECLARE
  batch_size INT := 1000;
  updated INT;
BEGIN
  WITH batch AS (
    SELECT id
    FROM public.products
    WHERE search_text IS NULL
    LIMIT batch_size
  )
  UPDATE public.products p
  SET
    brand_norm = CASE WHEN p.brand IS NOT NULL AND p.brand <> ''
      THEN lower(public.unaccent(p.brand)) ELSE NULL END,
    category_norm = CASE WHEN p.category IS NOT NULL AND p.category <> ''
      THEN lower(public.unaccent(p.category)) ELSE NULL END,
    subcategory_norm = CASE WHEN p.subcategory IS NOT NULL AND p.subcategory <> ''
      THEN lower(public.unaccent(p.subcategory)) ELSE NULL END,
    county_norm = CASE WHEN p.county IS NOT NULL AND p.county <> ''
      THEN lower(public.unaccent(p.county)) ELSE NULL END,
    city_norm = CASE WHEN p.city IS NOT NULL AND p.city <> ''
      THEN lower(public.unaccent(p.city)) ELSE NULL END,
    search_text = lower(public.unaccent(
      coalesce(p.title,'') || ' ' ||
      coalesce(p.category,'') || ' ' ||
      coalesce(p.subcategory,'') || ' ' ||
      coalesce(p.category_level_3,'') || ' ' ||
      coalesce(p.brand,'') || ' ' ||
      coalesce(p.slug,'')
    ))
  FROM batch b
  WHERE p.id = b.id;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RAISE NOTICE 'Backfill batch: % rows updated', updated;
END $$;
