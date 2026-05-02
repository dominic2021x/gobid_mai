-- pg_stat_statements (2026-05-02): dominant PostgREST shape
--   WHERE status = ANY($active_like) AND status <> 'deleted'
--   ORDER BY created_at DESC, id DESC  (+ json_agg body)
--
-- 20260502100000: products_postgrest_feed_status_created_id_idx pe toate rândurile non-deleted.
-- Aici: index mai mic pentru setul uzual de listări vizibile (marketplace), ca plannerul să prefere
-- un arbore mai dens când ANY = doar aceste statusuri.

create index if not exists products_postgrest_open_statuses_created_id_idx
  on public.products (status, created_at desc, id desc)
  where status in ('active', 'reserved', 'sold', 'in_progress');

comment on index public.products_postgrest_open_statuses_created_id_idx is
  'Feed PostgREST când status = ANY(active|reserved|sold|in_progress) — subset strâns față de <> deleted.';
