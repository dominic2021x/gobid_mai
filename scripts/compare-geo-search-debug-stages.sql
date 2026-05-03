-- Compare debug stages across 4 geo RPC scenarios.
-- Requires: migration 20260503230000_search_ro_listings_enterprise_debug_stages.sql applied on DB.
-- Run (psql rejects ?pgbouncer= in URI — strip query string):
--   URI=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
--   psql "${URI}?sslmode=require" -v ON_ERROR_STOP=1 -f scripts/compare-geo-search-debug-stages.sql
-- Or paste into Supabase SQL editor (single statement).

WITH params AS (
  SELECT
    0::integer AS p_offset,
    25::integer AS p_limit,
    44.451::double precision AS p_near_lat,
    25.977::double precision AS p_near_lng
),
scenarios (scenario, skip_dist, skip_bbox, force_radius_km) AS (
  VALUES
    ('1_baseline'::text, false, false, NULL::double precision),
    ('2_skip_distance_sort'::text, true, false, NULL::double precision),
    ('3_skip_bbox'::text, false, true, NULL::double precision),
    ('4_radius_1000km'::text, false, false, 1000::double precision)
)
SELECT
  s.scenario,
  pr.p_offset AS "offset",
  pr.p_limit AS "limit",
  r.debug_cnt_all AS cnt_all,
  r.debug_cnt_geo AS cnt_geo,
  r.debug_cnt_candidates_geo AS cnt_candidates_geo,
  r.debug_cnt_page_geo AS cnt_page_geo,
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'lat', elem->'geo_lat',
          'lng', elem->'geo_lng',
          'dist_m', elem->'dist_m'
        )
        ORDER BY ord
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(coalesce(r.debug_geo_slice_sample, '[]'::jsonb))
      WITH ORDINALITY AS t(elem, ord)
    WHERE ord <= 5
  ) AS geo_slice_first_5_lat_lng_dist
FROM scenarios s
CROSS JOIN params pr
LEFT JOIN LATERAL (
  SELECT
    x.debug_cnt_all,
    x.debug_cnt_geo,
    x.debug_cnt_candidates_geo,
    x.debug_cnt_page_geo,
    x.debug_geo_slice_sample
  FROM public.search_ro_listings_enterprise(
    p_q => NULL::text,
    p_offset => pr.p_offset,
    p_limit => pr.p_limit,
    p_near_lat => pr.p_near_lat,
    p_near_lng => pr.p_near_lng,
    p_radius_km => NULL::double precision,
    p_sort => 'newest'::text,
    p_debug => true,
    p_debug_skip_distance_sort => s.skip_dist,
    p_debug_skip_bbox => s.skip_bbox,
    p_debug_force_radius_km => s.force_radius_km
  ) AS x
  LIMIT 1
) r ON true
ORDER BY s.scenario;
