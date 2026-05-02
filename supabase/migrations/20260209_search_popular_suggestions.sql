-- ============================================
-- Migration: search_popular_suggestions
-- "Căutări frecvente" persisted in DB (consistent across devices).
-- ============================================

CREATE TABLE IF NOT EXISTS public.search_popular_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang text NOT NULL DEFAULT 'ro',
  label text NOT NULL,
  q text NOT NULL,
  category_slug text,
  subcategory_slug text,
  priority int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_popular_suggestions_lang_active_priority
  ON public.search_popular_suggestions (lang, active, priority DESC, created_at DESC);

COMMENT ON TABLE public.search_popular_suggestions IS 'Popular search suggestions (Căutări frecvente) – shown on focus, same for all devices';
