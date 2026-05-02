-- Phase 2.1 — index audit for public.products (run in staging; review before DROP).
-- Indexes with idx_scan = 0 after a warm-up window are candidates to merge/drop.

select
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where schemaname = 'public'
  and relname = 'products'
order by idx_scan asc, indexrelname;

-- Compare overlapping definitions (manual): products_status_created_* vs products_postgrest_feed_*.
