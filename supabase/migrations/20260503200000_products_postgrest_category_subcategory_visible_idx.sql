-- PostgREST / service_role patterns from pg_stat_statements (2026-05-02):
--   (approval_status IS NULL OR approval_status = $approved)
--   AND category = $category
--   AND status = ANY ($statuses) AND status <> 'deleted'
--   ORDER BY created_at DESC, id DESC
-- plus the OR variant:
--   (category = $cat OR subcategory = ANY ($subs))
--
-- 20260503143000 adds partial indexes on (status) / (channel, status) for counts;
-- this migration adds category/subcategory leading columns for selective scans + sort.

create index if not exists products_visible_category_created_id_idx
  on public.products (category, created_at desc, id desc)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved')
    and category is not null
    and category <> '';

comment on index public.products_visible_category_created_id_idx is
  'Visible listings by category, newest-first (PostgREST feed + count CTE shape).';

create index if not exists products_visible_subcategory_created_id_idx
  on public.products (subcategory, created_at desc, id desc)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved')
    and subcategory is not null
    and subcategory <> '';

comment on index public.products_visible_subcategory_created_id_idx is
  'Visible listings by subcategory (OR branch with category), newest-first.';
