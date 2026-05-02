-- Hot path indexes observed in Query Performance on 2026-05-02.
-- 1) Feed: WHERE status = ANY(...) AND status <> 'deleted'
--    ORDER BY created_at DESC LIMIT/OFFSET or keyset.
--    Keep this separate from status-leading indexes because multi-status feeds
--    are primarily ordered by global recency.
create index if not exists products_feed_created_id_no_deleted_idx
  on public.products (created_at desc, id desc)
  where status is distinct from 'deleted';

comment on index public.products_feed_created_id_no_deleted_idx is
  'RO feed newest-first: products non-deleted ordered by created_at/id for offset and keyset pagination.';

-- 2) Search suggestions candidates RPC:
--    prefix_matches uses phrase_norm LIKE q || '%' plus is_public/is_active.
--    text_pattern_ops gives the planner a btree prefix path before trigram/fuzzy ranking.
create index if not exists search_suggestions_active_phrase_prefix_idx
  on public.search_suggestions (phrase_norm text_pattern_ops)
  where is_public = true
    and is_active = true
    and phrase_norm is not null
    and length(trim(phrase_norm)) >= 2;

comment on index public.search_suggestions_active_phrase_prefix_idx is
  'Autocomplete hot path: active public suggestions prefix lookup on phrase_norm.';
