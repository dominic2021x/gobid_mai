-- Hot path after feed/keyset optimization:
-- PostgREST exact count for visible listings:
--   (approval_status is null OR approval_status = 'approved')
--   AND status = ANY(...)
--   AND status <> 'deleted'
--
-- The existing approved indexes use coalesce(approval_status,'approved')='approved';
-- PostgREST emits the OR form above, so this partial predicate matches that SQL shape.
create index if not exists products_visible_status_count_hot_idx
  on public.products (status)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved');

comment on index public.products_visible_status_count_hot_idx is
  'PostgREST exact count hot path for visible RO listings by status.';

-- Same count path when channel gating is enabled.
create index if not exists products_visible_channel_status_count_hot_idx
  on public.products (channel, status)
  where status <> 'deleted'
    and (approval_status is null or approval_status = 'approved');

comment on index public.products_visible_channel_status_count_hot_idx is
  'PostgREST exact count hot path for visible RO listings by channel/status.';
