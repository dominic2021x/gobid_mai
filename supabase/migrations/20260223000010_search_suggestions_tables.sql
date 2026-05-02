-- ============================================
-- Migration: search_suggestions + search_suggestion_synonyms
-- Sugestii de search deterministe, cache-uibile, cu suport RO (diacritice, abrevieri).
-- pg_trgm pentru matching rapid pe phrase_norm.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- A) search_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase text NOT NULL,
  phrase_norm text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('query', 'category', 'subcategory', 'county', 'city', 'brand', 'attribute')),
  popularity int NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phrase_norm, kind)
);

COMMENT ON TABLE public.search_suggestions IS 'Sugestii de căutare instant (fără LLM); phrase = afișat în UI, phrase_norm = normalizat RO.';

CREATE INDEX IF NOT EXISTS idx_search_suggestions_phrase_norm_trgm
  ON public.search_suggestions USING gin (phrase_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_search_suggestions_kind_popularity
  ON public.search_suggestions (kind, popularity DESC);

CREATE INDEX IF NOT EXISTS idx_search_suggestions_updated_at
  ON public.search_suggestions (updated_at);

-- ---------------------------------------------------------------------------
-- B) search_suggestion_synonyms (expansiuni RO)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_suggestion_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_norm text NOT NULL,
  to_phrase text NOT NULL,
  to_norm text NOT NULL,
  weight int NOT NULL DEFAULT 1,
  UNIQUE (from_norm, to_norm)
);

COMMENT ON TABLE public.search_suggestion_synonyms IS 'Sinonime/expansiuni pentru sugestii RO (ex: ap -> apartament).';

CREATE INDEX IF NOT EXISTS idx_search_suggestion_synonyms_from_norm
  ON public.search_suggestion_synonyms (from_norm);
