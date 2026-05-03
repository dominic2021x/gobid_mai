-- Run in Supabase SQL editor after migrations. Shows planning time, execution time, buffers, index hits.
-- Replace lat/lng/radius with values matching production queries.
-- With a center, the RPC uses geo_slice (bbox + sphere, includes NULL geo) then optional fallback to
-- full filtered_all when geo_slice is empty; expect Index / Bitmap scans on products (not Seq Scan) when
-- stats and filters are typical—validate after deploy.

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, title, city, county
FROM public.search_ro_listings_enterprise(
  p_q => NULL,
  p_limit => 24,
  p_near_lat => 44.451,
  p_near_lng => 25.977,
  p_radius_km => NULL,
  p_sort => 'newest'
);

-- Exact total for same geo box (should use same bbox predicates as search inner query plan shape).
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT public.count_ro_listings_enterprise(
  p_q => NULL,
  p_near_lat => 44.451,
  p_near_lng => 25.977,
  p_radius_km => NULL
);
