-- PostgREST service_role (2026-05-02 pg_stat_statements):
--   (category = $1 OR subcategory = ANY ($2))
--   AND status = ANY ($3) AND status <> 'deleted'
--   ORDER BY created_at DESC, id DESC
-- Often **no** predicate on approval_status — partial indexes that require
-- (approval_status IS NULL OR approval_status = 'approved') are invisible to the planner.
--
-- Complements:
--   - 20260428212600: (category|subcategory, status, created_at desc, …) — best when status is selective.
--   - This file: (category|subcategory, created_at desc, id desc) — sort-aligned path + BitmapOr legs for OR filters.

create index if not exists products_feed_category_created_id_no_approval_idx
  on public.products (category, created_at desc, id desc)
  where status <> 'deleted'
    and category is not null
    and category <> '';

comment on index public.products_feed_category_created_id_no_approval_idx is
  'PostgREST feed by category (no approval filter): newest-first; pairs with subcategory index for OR plans.';

create index if not exists products_feed_subcategory_created_id_no_approval_idx
  on public.products (subcategory, created_at desc, id desc)
  where status <> 'deleted'
    and subcategory is not null
    and subcategory <> '';

comment on index public.products_feed_subcategory_created_id_no_approval_idx is
  'PostgREST feed subcategory branch + OR with category; newest-first without approval predicate.';
