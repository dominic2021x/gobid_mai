-- FTS improvements: weights doar title (A) + description (B), prefix query word:*, ts_rank_cd (deja).
-- GIN pe search_vector rămâne valid după schimbarea conținutului vectorului (rebuild prin UPDATE).

CREATE OR REPLACE FUNCTION public.build_prefix_tsquery(p_raw text)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  parts text[];
  t text;
  pieces text[] := ARRAY[]::text[];
  n int := 0;
  cleaned text;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN NULL;
  END IF;

  parts := regexp_split_to_array(btrim(unaccent(lower(p_raw))), '\s+');

  FOREACH t IN ARRAY parts LOOP
    cleaned := regexp_replace(t, '[^a-z0-9]+', '', 'g');
    IF length(cleaned) < 1 OR length(cleaned) > 48 THEN
      CONTINUE;
    END IF;
    pieces := array_append(pieces, cleaned || ':*');
    n := n + 1;
    IF n >= 8 THEN
      EXIT;
    END IF;
  END LOOP;

  IF coalesce(array_length(pieces, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN to_tsquery('simple', array_to_string(pieces, ' & '));
END;
$$;

COMMENT ON FUNCTION public.build_prefix_tsquery(text) IS
  'Prefix FTS: fiecare token devine lexeme:*, legate cu AND (ex. bmw:* & seria:*). NULL dacă nu e nimic valid.';

-- Vector: doar titlu (A) și descriere (B) — potrivit cu ts_rank_cd pe greutăți.
CREATE OR REPLACE FUNCTION public.products_search_vector_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.title::text), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(unaccent(NEW.description::text), '')), 'B');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_vector_trg ON public.products;

CREATE TRIGGER products_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, description
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_vector_refresh();

-- Skip full-table rebuild during migration push; use a dedicated maintenance run later if needed.

-- RPC: ts_rank_cd, prefix tsquery cu fallback la plainto_tsquery
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
    SELECT COALESCE(
      public.build_prefix_tsquery((SELECT raw FROM q)),
      plainto_tsquery('simple', unaccent((SELECT raw FROM q)))
    ) AS tsq
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
    AND (SELECT tsq FROM ts) IS NOT NULL
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

COMMENT ON COLUMN public.products.search_vector IS
  'FTS: weighted title=A, description=B; GIN idx idx_products_search_vector_gin_active.';

COMMENT ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, int) IS
  'FTS: prefix tsquery (token:*), ts_rank_cd (norm 32), filtre opționale; max 20 rânduri.';

-- Skip large GIN build during migration push.
