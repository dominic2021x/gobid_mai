-- PostgREST feed shape: WHERE status = ANY($1) AND status <> 'deleted'
-- ORDER BY created_at DESC LIMIT … OFFSET … (fără filtru explicit pe approval_status).
-- Indexul partial din 20260501133000 cere coalesce(approval_status,'approved')='approved';
-- plannerul nu poate folosi acel index pentru cereri care nu restrâng la fel pe approval.

create index if not exists products_postgrest_feed_status_created_id_idx
  on public.products (status, created_at desc, id desc)
  where status is distinct from 'deleted';

comment on index public.products_postgrest_feed_status_created_id_idx is
  'Feed PostgREST / service_role: orice status în afară de deleted, sortare newest-first.';
