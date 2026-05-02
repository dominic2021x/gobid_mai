-- ============================================
-- Phase 2b: Trigger to keep _norm columns in sync
-- ============================================
-- Run after Phase 2 backfill. Ensures new/updated rows get normalized values.
-- App-level write path should also set these; trigger is fallback for legacy writes.
--
-- If unaccent is in schema "extensions" (Supabase): replace public.unaccent with extensions.unaccent

CREATE OR REPLACE FUNCTION public.products_normalize_columns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.brand_norm := CASE WHEN NEW.brand IS NOT NULL AND NEW.brand <> ''
    THEN lower(public.unaccent(NEW.brand)) ELSE NULL END;
  NEW.category_norm := CASE WHEN NEW.category IS NOT NULL AND NEW.category <> ''
    THEN lower(public.unaccent(NEW.category)) ELSE NULL END;
  NEW.subcategory_norm := CASE WHEN NEW.subcategory IS NOT NULL AND NEW.subcategory <> ''
    THEN lower(public.unaccent(NEW.subcategory)) ELSE NULL END;
  NEW.county_norm := CASE WHEN NEW.county IS NOT NULL AND NEW.county <> ''
    THEN lower(public.unaccent(NEW.county)) ELSE NULL END;
  NEW.city_norm := CASE WHEN NEW.city IS NOT NULL AND NEW.city <> ''
    THEN lower(public.unaccent(NEW.city)) ELSE NULL END;
  NEW.search_text := lower(public.unaccent(
    coalesce(NEW.title,'') || ' ' ||
    coalesce(NEW.category,'') || ' ' ||
    coalesce(NEW.subcategory,'') || ' ' ||
    coalesce(NEW.category_level_3,'') || ' ' ||
    coalesce(NEW.brand,'') || ' ' ||
    coalesce(NEW.slug,'')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_normalize_columns_trigger ON public.products;
CREATE TRIGGER products_normalize_columns_trigger
  BEFORE INSERT OR UPDATE OF brand, category, subcategory, county, city, title, slug, category_level_3
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_normalize_columns();
