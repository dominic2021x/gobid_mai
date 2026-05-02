-- Run in Supabase SQL Editor / psql outside a transaction.
-- Do not wrap in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suggest_phrase_norm_prefix
  ON public.search_suggestions (phrase_norm text_pattern_ops)
  WHERE is_public = true AND kind = 'query';
