-- FTS polish: rank calculat o dată în CTE, ORDER BY rank, created_at, id;
-- ts_headline MaxWords=24, MaxFragments=2; dacă tsquery e NULL → ultimele listări (aceleași filtre).

DROP FUNCTION IF EXISTS public.search_products_fts(text, numeric, numeric, text, text, integer);

CREATE OR REPLACE FUNCTION public.search_products_fts(
  p_query text,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_tsq tsquery;
  v_lim int;
BEGIN
  v_lim := LEAST(COALESCE(NULLIF(p_limit, 0), 20), 20);
  v_raw := NULLIF(btrim(left(btrim(COALESCE(p_query, '')), 120)), '');
  v_tsq := CASE
    WHEN v_raw IS NULL THEN NULL
    ELSE COALESCE(
      public.build_prefix_tsquery(v_raw),
      plainto_tsquery('simple', unaccent(v_raw))
    )
  END;

  -- Fără query sau tsquery NULL → ultimele anunțuri (aceleași filtre), fără FTS
  IF v_raw IS NULL OR v_tsq IS NULL THEN
    RETURN QUERY
    SELECT
      p.id,
      0::real AS rank,
      left(unaccent(coalesce(p.description::text, '')), 240) AS snippet,
      p.title,
      p.slug,
      left(p.description, 800) AS description,
      p.category,
      p.subcategory,
      COALESCE(p.starting_price_ron, p.starting_price)::numeric,
      p.city,
      p.county,
      coalesce(p.images, '[]'::jsonb),
      p.product_type,
      p.status,
      p.url,
      p.created_at,
      p.updated_at
    FROM public.products p
    WHERE p.status = 'active'
      AND coalesce(p.approval_status, 'approved'::text) = 'approved'::text
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
    ORDER BY p.created_at DESC NULLS LAST, p.id DESC
    LIMIT v_lim;
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      p.id AS sid,
      (ts_rank_cd(p.search_vector, v_tsq))::real AS rnk,
      ts_headline(
        'simple'::regconfig,
        unaccent(coalesce(p.title, '')) || E' ' || unaccent(left(coalesce(p.description::text, ''), 6000)),
        v_tsq,
        'MaxWords=24, MinWords=6, ShortWord=2, MaxFragments=2, StartSel=«, StopSel=»'
      ) AS snip,
      p.title AS stitle,
      p.slug AS sslug,
      left(p.description, 800) AS sdesc,
      p.category AS scat,
      p.subcategory AS ssub,
      COALESCE(p.starting_price_ron, p.starting_price)::numeric AS sprice,
      p.city AS scity,
      p.county AS scounty,
      coalesce(p.images, '[]'::jsonb) AS simages,
      p.product_type AS spt,
      p.status AS sstatus,
      p.url AS surl,
      p.created_at AS screated,
      p.updated_at AS supdated
    FROM public.products p
    WHERE p.status = 'active'
      AND coalesce(p.approval_status, 'approved'::text) = 'approved'::text
      AND p.search_vector @@ v_tsq
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
  )
  SELECT
    scored.sid,
    scored.rnk,
    scored.snip,
    scored.stitle,
    scored.sslug,
    scored.sdesc,
    scored.scat,
    scored.ssub,
    scored.sprice,
    scored.scity,
    scored.scounty,
    scored.simages,
    scored.spt,
    scored.sstatus,
    scored.surl,
    scored.screated,
    scored.supdated
  FROM scored
  ORDER BY scored.rnk DESC, scored.screated DESC NULLS LAST, scored.sid DESC
  LIMIT v_lim;
END;
$$;

COMMENT ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, integer) IS
  'FTS: rank în CTE; ts_headline MaxWords=24 MaxFragments=2; tie-break id; tsquery NULL → latest; query max 120 chars.';

GRANT EXECUTE ON FUNCTION public.search_products_fts(text, numeric, numeric, text, text, integer)
  TO anon, authenticated, service_role;

-- Skip large products index builds during migration push.
