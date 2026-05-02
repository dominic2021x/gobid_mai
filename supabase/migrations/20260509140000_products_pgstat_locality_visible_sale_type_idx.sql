-- pg_stat_statements (service_role / PostgREST):
-- 1) locality_search ilike + approval OR + category/product_type/sale_type OR + status
-- 2) Heavy exact count: same filters with pgrst_source_count scanning all matches
--
-- Existing: products_locality_search_trgm_hot_idx (toate non-deleted cu locality).
-- Aici: partial mai strâns (doar anunțuri „vizibile” ca în UI) → index mai mic, bitmap AND mai bun cu filtrele de mai sus.
-- Plus: btree partial pe (sale_type, status) pentru piciorul OR pe sale_type în count/listă.

create extension if not exists pg_trgm;

create index if not exists products_locality_search_trgm_public_visible_idx
  on public.products using gin (locality_search extensions.gin_trgm_ops)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved')
    and locality_search is not null
    and locality_search <> '';

comment on index public.products_locality_search_trgm_public_visible_idx is
  'PostgREST: locality_search ILIKE + vizibilitate (approval) — subset față de products_locality_search_trgm_hot_idx.';

create index if not exists products_visible_sale_type_status_idx
  on public.products (sale_type, status)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved');

comment on index public.products_visible_sale_type_status_idx is
  'PostgREST count/list: OR leg pe sale_type + status + aceeași vizibilitate ca feed-ul public.';

analyze public.products;
