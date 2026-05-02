-- Run in Supabase SQL Editor / psql outside a transaction.
-- Do not wrap in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suggest_user_seed_rank
  ON public.search_suggestions (
    (COALESCE((meta->>'user_count')::int, 0)),
    (COALESCE((meta->>'seed_count')::int, 0)),
    updated_at DESC
  )
  WHERE is_public = true AND kind = 'query';
