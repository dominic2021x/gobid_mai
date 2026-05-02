-- Filters Lab support for Executari / Licitatii Publice normalization.
-- Safe to run in Supabase SQL Editor.

-- 1) Persisted state storage used by /api/admin/filters-lab/state
create table if not exists public.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_settings_updated_at on public.settings(updated_at desc);

-- 2) Performance index for LICITATII PUBLICE scans and recategorization jobs
create index if not exists idx_products_lp_scope
  on public.products (product_type, sale_type, category, subcategory)
  where product_type = 'licitatii-publice'
     or sale_type in ('licitatii-insolventa', 'licitatie-publica');

-- 3) Optional helper: inspect current fine-grained detail buckets
-- select
--   category,
--   subcategory,
--   custom_fields->>'listing_category' as listing_category,
--   count(*) as total
-- from public.products
-- where product_type = 'licitatii-publice'
--    or sale_type in ('licitatii-insolventa', 'licitatie-publica')
-- group by 1,2,3
-- order by total desc;
