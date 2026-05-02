-- ============================================
-- Production hardening: uniqueness, seed_count vs user_count, indexes
-- Depends on: 20260225_agent_state_seed_suggestions.sql (columns source, entity_type; RPC)
-- ============================================

-- ---------------------------------------------------------------------------
-- A) Uniqueness: (phrase_norm, kind, entity_type, is_public)
-- ---------------------------------------------------------------------------
UPDATE public.search_suggestions SET entity_type = '' WHERE entity_type IS NULL;
ALTER TABLE public.search_suggestions ALTER COLUMN entity_type SET DEFAULT '';
ALTER TABLE public.search_suggestions ALTER COLUMN entity_type SET NOT NULL;

ALTER TABLE public.search_suggestions DROP CONSTRAINT IF EXISTS search_suggestions_phrase_norm_kind_key;
ALTER TABLE public.search_suggestions
  ADD CONSTRAINT search_suggestions_phrase_norm_kind_entity_public_key
  UNIQUE (phrase_norm, kind, entity_type, is_public);

-- ---------------------------------------------------------------------------
-- B) RPC: seed_count only (do not touch user_count)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_search_suggestion_seed(
  _rows jsonb,
  _source text DEFAULT 'seed_titles',
  _listing_id text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  r jsonb;
  cnt int := 0;
  v_phrase text;
  v_phrase_norm text;
  v_entity_type text;
  v_is_public boolean;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_phrase := r->>'phrase';
    v_phrase_norm := r->>'phrase_norm';
    v_entity_type := COALESCE(NULLIF(trim(r->>'entity_type'), ''), '');
    v_is_public := COALESCE((r->>'is_public')::boolean, true);

    IF v_phrase IS NULL OR v_phrase_norm IS NULL OR length(trim(v_phrase_norm)) < 2 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.search_suggestions (
      phrase,
      phrase_norm,
      kind,
      popularity,
      meta,
      source,
      entity_type,
      is_public,
      updated_at
    )
    VALUES (
      v_phrase,
      v_phrase_norm,
      'query',
      0,
      jsonb_build_object(
        'seed_count', 1,
        'last_seen_listing_id', _listing_id
      ),
      _source,
      v_entity_type,
      v_is_public,
      now()
    )
    ON CONFLICT (phrase_norm, kind, entity_type, is_public)
    DO UPDATE SET
      phrase = EXCLUDED.phrase,
      updated_at = now(),
      source = COALESCE(EXCLUDED.source, search_suggestions.source),
      meta = jsonb_set(
        jsonb_set(
          COALESCE(search_suggestions.meta, '{}'::jsonb),
          '{seed_count}',
          to_jsonb(GREATEST(1, COALESCE((search_suggestions.meta->>'seed_count')::int, 0) + 1))
        ),
        '{last_seen_listing_id}',
        to_jsonb(COALESCE(_listing_id::text, search_suggestions.meta->>'last_seen_listing_id'))
      );
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

COMMENT ON FUNCTION public.upsert_search_suggestion_seed(jsonb, text, text) IS
  'Bulk upsert seed suggestions; increments meta.seed_count on conflict. Does not modify meta.user_count.';

-- ---------------------------------------------------------------------------
-- C) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_search_suggestions_is_public_kind_phrase_norm
  ON public.search_suggestions (is_public, kind, phrase_norm);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_search_suggestions_phrase_norm_trgm
  ON public.search_suggestions USING gin (phrase_norm gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- D) bump_search_popularity: use new unique (phrase_norm, kind, entity_type, is_public)
-- User tracking: entity_type = '', is_public = true; do not touch meta.seed_count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_search_popularity(
  q_norm text,
  phrase_display text DEFAULT NULL
)
RETURNS TABLE(popularity int, created boolean)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_trim text;
  v_pop int;
  v_created boolean;
BEGIN
  v_trim := trim(coalesce(q_norm, ''));
  IF v_trim = '' OR length(v_trim) < 2 THEN
    popularity := 0;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.search_suggestions (
    phrase, phrase_norm, kind, popularity, meta, updated_at, entity_type, is_public
  )
  VALUES (
    coalesce(nullif(trim(phrase_display), ''), v_trim),
    v_trim,
    'query',
    1,
    '{}'::jsonb,
    now(),
    '',
    true
  )
  ON CONFLICT (phrase_norm, kind, entity_type, is_public)
  DO UPDATE SET
    popularity = public.search_suggestions.popularity + 1,
    updated_at = now()
  RETURNING public.search_suggestions.popularity INTO v_pop;

  popularity := v_pop;
  created := (v_pop = 1);
  RETURN NEXT;
  RETURN;
END;
$$;
