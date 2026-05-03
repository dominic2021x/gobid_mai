-- RO instant search foundation — Phase 1.2: keyset feed index for the visible /ro stream.
-- Composite key matches `where approval_normalized = 'approved' and status <> 'deleted' order by created_at desc, id desc`.
--
-- Note: Supabase migrations run inside a transaction; CREATE INDEX CONCURRENTLY is unsupported.
-- This is a small partial index (visible feed only) so the brief lock is acceptable.

create index if not exists products_approval_normalized_visible_feed_keyset_idx
  on public.products (approval_normalized, status, created_at desc, id desc)
  where status <> 'deleted';

comment on index public.products_approval_normalized_visible_feed_keyset_idx is
  'Visible /ro feed: (approval_normalized, status, created_at desc, id desc) keyset, status<>deleted.';
