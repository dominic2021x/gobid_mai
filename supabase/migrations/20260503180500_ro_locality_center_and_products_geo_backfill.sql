-- Server-side location center resolution (exact + fuzzy) + product geo backfill from ro_localities.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pe Supabase, opclass-ul trigram e în schema `extensions` (altfel 42704 gin_trgm_ops).
CREATE INDEX IF NOT EXISTS ro_localities_city_norm_trgm_idx
  ON public.ro_localities USING gin (city_norm extensions.gin_trgm_ops);

COMMENT ON INDEX public.ro_localities_city_norm_trgm_idx IS
  'Trigram index for fuzzy locality lookup (resolve_ro_locality_center).';

CREATE OR REPLACE FUNCTION public.resolve_ro_locality_center(
  p_city_norm text,
  p_county_norm text DEFAULT NULL
)
RETURNS TABLE (
  latitude double precision,
  longitude double precision,
  match_kind text
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  lat_v double precision;
  lng_v double precision;
  county_trim text := nullif(btrim(coalesce(p_county_norm, '')), '');
BEGIN
  IF p_city_norm IS NULL OR length(btrim(p_city_norm)) < 2 THEN
    RETURN;
  END IF;

  SELECT rl.latitude, rl.longitude
  INTO lat_v, lng_v
  FROM public.ro_localities rl
  WHERE rl.city_norm = p_city_norm
  ORDER BY
    CASE
      WHEN county_trim IS NOT NULL AND rl.county_norm = county_trim THEN 0
      WHEN county_trim IS NOT NULL AND position(county_trim in coalesce(rl.county_norm, '')) > 0 THEN 1
      ELSE 2
    END,
    rl.city_name ASC
  LIMIT 1;

  IF FOUND AND lat_v IS NOT NULL AND lng_v IS NOT NULL
     AND abs(lat_v) <= 90 AND abs(lng_v) <= 180 THEN
    latitude := lat_v;
    longitude := lng_v;
    match_kind := 'exact';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT rl.latitude, rl.longitude
  INTO lat_v, lng_v
  FROM public.ro_localities rl
  WHERE length(p_city_norm) >= 3
    AND similarity(rl.city_norm, p_city_norm) > 0.45
  ORDER BY
    CASE
      WHEN county_trim IS NOT NULL AND rl.county_norm = county_trim THEN 0
      WHEN county_trim IS NOT NULL AND position(county_trim in coalesce(rl.county_norm, '')) > 0 THEN 1
      ELSE 2
    END,
    similarity(rl.city_norm, p_city_norm) DESC,
    rl.city_name ASC
  LIMIT 1;

  IF FOUND AND lat_v IS NOT NULL AND lng_v IS NOT NULL
     AND abs(lat_v) <= 90 AND abs(lng_v) <= 180 THEN
    latitude := lat_v;
    longitude := lng_v;
    match_kind := 'fuzzy';
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.resolve_ro_locality_center(text, text) IS
  'Resolve Romanian locality center: exact city_norm first, then trigram fuzzy; optional county_norm tie-break.';

-- Backfill products.geo_lat / geo_lng from ro_localities (batched, idempotent).
DO $$
DECLARE
  rows_done int;
  stagnant int := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT p.id, p.city, p.county
      FROM public.products p
      WHERE p.geo_lat IS NULL
        AND p.geo_lng IS NULL
        AND nullif(btrim(p.city), '') IS NOT NULL
      LIMIT 10000
    ),
    matched AS (
      SELECT b.id, loc.latitude AS lat_v, loc.longitude AS lng_v
      FROM batch b
      CROSS JOIN LATERAL (
        SELECT rl.latitude, rl.longitude
        FROM public.ro_localities rl
        WHERE rl.city_norm = lower(unaccent(btrim(b.city)))
        ORDER BY CASE
            WHEN nullif(btrim(b.county), '') IS NOT NULL
              AND rl.county_norm = lower(unaccent(btrim(b.county)))
            THEN 0
            ELSE 1
          END,
          rl.city_name ASC
        LIMIT 1
      ) loc
      WHERE loc.latitude IS NOT NULL
        AND loc.longitude IS NOT NULL
        AND abs(loc.latitude) <= 90
        AND abs(loc.longitude) <= 180
    )
    UPDATE public.products p
    SET geo_lat = m.lat_v,
        geo_lng = m.lng_v
    FROM matched m
    WHERE p.id = m.id;

    GET DIAGNOSTICS rows_done = ROW_COUNT;
    EXIT WHEN rows_done = 0 AND stagnant >= 1;
    IF rows_done = 0 THEN
      stagnant := stagnant + 1;
    ELSE
      stagnant := 0;
    END IF;
    EXIT WHEN stagnant >= 2;
  END LOOP;
END $$;
