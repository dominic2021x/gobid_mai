-- Final targeted indexes from post-reset Query Performance.
-- Narrow indexes only; avoid broad write-heavy indexes during import-heavy flows.

create index if not exists products_type_status_created_idx
  on public.products (product_type, status, created_at desc, id desc)
  where status <> 'deleted';

create index if not exists products_category_trgm_idx
  on public.products using gin (category extensions.gin_trgm_ops)
  where category is not null and category <> '';

create index if not exists products_subcategory_trgm_idx
  on public.products using gin (subcategory extensions.gin_trgm_ops)
  where subcategory is not null and subcategory <> '';
