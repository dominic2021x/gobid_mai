-- Polish FTS: prefix tokens min length 2, query cap 120 chars, ts_headline snippet, sort by rank + created_at.
-- tsvector build rămâne: unaccent(...) + setweight title A, description B.

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
    -- Token minim 2 caractere (prefix matching)
    IF length(cleaned) < 2 OR length(cleaned) > 48 THEN
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
  'Prefix FTS: token:* cu AND; ignoră tokeni < 2 caractere după curățare.';

-- Confirmă vector: unaccent pe text înainte de to_tsvector (title A, description B).
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

-- Schimbarea tipului RETURN (coloane OUT) cere DROP înainte de CREATE.
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
  snippet text,
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
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(left(btrim(p_query), 120)), '') AS raw
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
    ts_headline(
      'simple'::regconfig,
      unaccent(coalesce(p.title, '')) || E' ' || unaccent(left(coalesce(p.description::text, ''), 6000)),
      (SELECT tsq FROM ts),
      'MaxWords=28, MinWords=4, ShortWord=2, MaxFragments=2, StartSel=«, StopSel=»'
    ) AS snippet,
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
    p.created_at,
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
  ORDER BY (ts_rank_cd(p.search_vector, (SELECT tsq FROM ts))) DESC, p.created_at DESC NULLS LAST
  LIMIT LEAST(coalesce(nullif(p_limit, 0), 20), 20);
$$;

COMMENT ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, integer) IS
  'FTS: query max 120 chars, prefix to_tsquery, ts_rank_cd, ts_headline snippet, ORDER BY rank DESC, created_at DESC.';

GRANT EXECUTE ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, integer)
  TO anon, authenticated, service_role;

-- Skip large GIN build during migration push.
