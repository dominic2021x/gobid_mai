-- Stage counts + toggles for search_ro_listings_enterprise (see migration 20260503230000).
-- Run in Supabase SQL editor. Use p_debug => true; read one result row for all debug_* fields.

-- Baseline: where do rows drop? (check debug_cnt_* on first row)
--   debug_cnt_all = filtered_all
--   debug_cnt_geo = geo_slice
--   debug_cnt_candidates_geo = after sort + candidate_cap
--   debug_cnt_page_geo = rows in paged geo result (≤ p_limit)
--   debug_cnt_final = size of winning candidate set (geo vs fallback)
--   debug_geo_slice_sample = up to 10 rows from geo_slice (id, title, coords, dist_m)

SELECT id, title, city, county,
  debug_cnt_all, debug_cnt_geo, debug_cnt_candidates_geo, debug_cnt_page_geo, debug_cnt_final,
  debug_geo_slice_sample
FROM public.search_ro_listings_enterprise(
  p_q => NULL,
  p_limit => 25,
  p_near_lat => 44.451,
  p_near_lng => 25.977,
  p_radius_km => NULL,
  p_sort => 'newest',
  p_debug => true
)
LIMIT 1;

-- 2) Without distance sort (ORDER BY geo distance disabled; still uses sort_key / boost)
SELECT id, title,
  debug_cnt_all, debug_cnt_geo, debug_cnt_candidates_geo, debug_cnt_page_geo
FROM public.search_ro_listings_enterprise(
  p_q => NULL, p_limit => 25, p_near_lat => 44.451, p_near_lng => 25.977,
  p_debug => true, p_debug_skip_distance_sort => true
) LIMIT 1;

-- 3) Without bbox prefilter (sphere only: earth_distance)
SELECT id, title,
  debug_cnt_all, debug_cnt_geo, debug_cnt_page_geo
FROM public.search_ro_listings_enterprise(
  p_q => NULL, p_limit => 25, p_near_lat => 44.451, p_near_lng => 25.977,
  p_debug => true, p_debug_skip_bbox => true
) LIMIT 1;

-- 4) Force 1000 km radius
SELECT id, title,
  debug_cnt_geo, debug_cnt_page_geo, debug_geo_slice_sample
FROM public.search_ro_listings_enterprise(
  p_q => NULL, p_limit => 25, p_near_lat => 44.451, p_near_lng => 25.977,
  p_debug => true, p_debug_force_radius_km => 1000
) LIMIT 1;
