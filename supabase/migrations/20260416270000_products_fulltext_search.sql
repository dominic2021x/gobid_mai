-- Full-text search on products: tsvector column, trigger refresh, GIN index, ranked RPC.
-- Uses unaccent + simple config (works for Romanian text without language-specific stemmer).

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

COMMENT ON COLUMN public.products.search_vector IS
  'Weighted FTS document (title A, description B, category/brand/model C, slug D); refreshed by trigger.';

CREATE OR REPLACE FUNCTION public.products_search_vector_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.title::text), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.description::text), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.category::text), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.subcategory::text), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.brand::text), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.model::text), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.slug::text), '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_vector_trg ON public.products;

CREATE TRIGGER products_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, description, category, subcategory, brand, model, slug
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_vector_refresh();

-- Intentionally skip full-table backfill and GIN build during migration push.
-- Run a dedicated maintenance operation later if historical search_vector values need rebuilding.

-- Ranked search: plainto_tsquery + ts_rank_cd; optional price / city / category filters.
DROP FUNCTION IF EXISTS public.search_products_fts(text, numeric, numeric, text, text, integer);

CREATE OR REPLACE FUNCTION public.search_products_fts(
  p_query text,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  rank real,
  title text,
  slug text,
  description text,
  category text,
  subcategory text,
  starting_price_ron numeric,
  city text,
  county text,
  images jsonb,
  product_type text,
  status text,
  url text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(p_query), '') AS raw
  ),
  ts AS (
    SELECT plainto_tsquery('simple', unaccent((SELECT raw FROM q))) AS tsq
  )
  SELECT
    p.id,
    (ts_rank_cd(p.search_vector, (SELECT tsq FROM ts)))::real AS rank,
    p.title,
    p.slug,
    left(p.description, 800) AS description,
    p.category,
    p.subcategory,
    COALESCE(p.starting_price_ron, p.starting_price)::numeric AS starting_price_ron,
    p.city,
    p.county,
    coalesce(p.images, '[]'::jsonb) AS images,
    p.product_type,
    p.status,
    p.url,
    p.updated_at
  FROM public.products p, ts, q
  WHERE q.raw IS NOT NULL
    AND p.status = 'active'
    AND coalesce(p.approval_status, 'approved'::text) = 'approved'::text
    AND p.search_vector @@ (SELECT tsq FROM ts)
    AND (p_min_price IS NULL OR COALESCE(p.starting_price_ron, p.starting_price, 0) >= p_min_price)
    AND (p_max_price IS NULL OR COALESCE(p.starting_price_ron, p.starting_price, 0) <= p_max_price)
    AND (
      p_city IS NULL
      OR btrim(p_city) = ''
      OR unaccent(lower(p.city)) LIKE '%' || unaccent(lower(btrim(p_city))) || '%'
    )
    AND (
      p_category IS NULL
      OR btrim(p_category) = ''
      OR lower(p.category) = lower(btrim(p_category))
      OR lower(p.subcategory) = lower(btrim(p_category))
    )
  ORDER BY ts_rank_cd(p.search_vector, (SELECT tsq FROM ts)) DESC, p.updated_at DESC NULLS LAST
  LIMIT LEAST(coalesce(nullif(p_limit, 0), 20), 20);
$$;

COMMENT ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, int) IS
  'Public product search: FTS + ts_rank_cd + optional price/city/category filters; max 20 rows.';

GRANT EXECUTE ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, int)
  TO anon, authenticated, service_role;
