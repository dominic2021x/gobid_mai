-- ============================================
-- Migration: search_suggestions.is_public (exclude token-gated / Executări & Insolvență from public suggest)
-- Backward compatible: default true; set false for gated content. RPC filters to public only.
-- ============================================

ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.search_suggestions.is_public IS 'false = do not show in public suggest (e.g. Executări & Insolvență); default true';

-- Index for RLS / filtered queries (optional; anon policy can use it)
CREATE INDEX IF NOT EXISTS idx_search_suggestions_kind_popularity_public
  ON public.search_suggestions (kind, popularity DESC)
  WHERE is_public = true;
