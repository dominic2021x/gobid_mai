-- Phase 0 — /ro listings diagnostics (run in staging/prod SQL editor as superuser or owner).
-- See docs/ro-listings-phase0-metrics.md for how to record p50/p95.

-- 1) Refresh planner stats after bulk imports
-- ANALYZE public.products;

-- 2) Confirm hot indexes exist (adjust names if migrations differ)
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'products'
--   AND indexname IN (
--     'products_postgrest_feed_status_created_id_idx',
--     'products_locality_search_trgm_public_visible_idx',
--     'products_visible_status_count_hot_idx',
--     'products_visible_category_created_id_idx',
--     'products_approval_normalized_visible_feed_keyset_idx'
--   );

-- 3) Index usage (find idx_scan = 0 after warm-up period)
-- SELECT relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND relname = 'products'
-- ORDER BY idx_scan ASC, indexrelname;

-- 4) Top statements (requires pg_stat_statements)
-- SELECT calls, mean_exec_time, max_exec_time, rows, left(query, 200) AS q
-- FROM pg_stat_statements
-- WHERE query ILIKE '%products%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 25;

-- 5) EXPLAIN templates — replace :term / bind params before run
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id FROM public.products
-- WHERE locality_search ILIKE '%' || :term || '%'
--   AND status = ANY (ARRAY['active','reserved','sold','in_progress']::text[])
--   AND status <> 'deleted'
--   AND coalesce(approval_status, 'approved') = 'approved'
-- LIMIT 24;
