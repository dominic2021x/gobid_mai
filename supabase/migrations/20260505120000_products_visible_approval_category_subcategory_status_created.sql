-- Dominant pg_stat_statements shape (2026-05-02): PostgREST id selection + exact count CTE
--   (approval_status IS NULL OR approval_status = $approved)
--   AND (category = $cat OR subcategory = ANY ($subs))
--   AND status = ANY ($statuses) AND status <> 'deleted'
--
-- Earlier indexes either omit approval (20260428212600 status-leading) or omit status in the
-- key (20260503200000 created_at sort path). This migration adds approval-visible legs that
-- include status before created_at so status = ANY(...) can narrow index ranges for both the
-- LIMIT/OFFSET id scan and the COUNT(*) sibling.

create index if not exists products_visible_approval_category_status_created_id_idx
  on public.products (category, status, created_at desc, id desc)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved')
    and category is not null
    and category <> '';

comment on index public.products_visible_approval_category_status_created_id_idx is
  'Approved-visible listings: category + status filter + recency (matches PostgREST OR category branch).';

create index if not exists products_visible_approval_subcategory_status_created_id_idx
  on public.products (subcategory, status, created_at desc, id desc)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved')
    and subcategory is not null
    and subcategory <> '';

comment on index public.products_visible_approval_subcategory_status_created_id_idx is
  'Approved-visible listings: subcategory + status filter + recency (OR branch + count CTE).';
