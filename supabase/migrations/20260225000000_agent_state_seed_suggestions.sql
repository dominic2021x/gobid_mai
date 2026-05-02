-- ============================================
-- Migration: agent_state + search_suggestions seed columns + RPC upsert
-- For OpenClaw seed-from-titles job: cursor state and idempotent bulk upsert.
-- ============================================

-- ---------------------------------------------------------------------------
-- A) agent_state (cursor / key-value for workers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_state IS 'Key-value state for agent jobs (e.g. openclaw_seed_suggestions cursor: last_listing_id).';

-- ---------------------------------------------------------------------------
-- B) search_suggestions: source + entity_type (optional, for seed attribution)
-- ---------------------------------------------------------------------------
ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS entity_type text;

COMMENT ON COLUMN public.search_suggestions.source IS 'Origin: seed_titles, track, bootstrap, etc.';
COMMENT ON COLUMN public.search_suggestions.entity_type IS 'E.g. real_estate, auto for seed extractors.';

-- Index for filtering by kind + phrase_norm (existing idx covers kind, popularity)
CREATE INDEX IF NOT EXISTS idx_search_suggestions_kind_phrase_norm
  ON public.search_suggestions (kind, phrase_norm);

-- ---------------------------------------------------------------------------
-- C) RPC: bulk upsert seed suggestions with atomic listing_count increment
-- Input: _rows = jsonb array of { phrase, phrase_norm, entity_type }
-- Conflict on (phrase_norm, kind). kind is always 'query' for seed.
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
    v_entity_type := r->>'entity_type';
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
        'listing_count', 1,
        'last_seen_listing_id', _listing_id
      ),
      _source,
      v_entity_type,
      v_is_public,
      now()
    )
    ON CONFLICT (phrase_norm, kind)
    DO UPDATE SET
      phrase = EXCLUDED.phrase,
      updated_at = now(),
      source = COALESCE(EXCLUDED.source, search_suggestions.source),
      entity_type = COALESCE(EXCLUDED.entity_type, search_suggestions.entity_type),
      is_public = EXCLUDED.is_public,
      meta = jsonb_build_object(
        'listing_count', GREATEST(1, (COALESCE((search_suggestions.meta->>'listing_count')::int, 0) + 1)),
        'last_seen_listing_id', COALESCE(_listing_id::text, search_suggestions.meta->>'last_seen_listing_id')
      );
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

COMMENT ON FUNCTION public.upsert_search_suggestion_seed(jsonb, text, text) IS
  'Bulk upsert seed suggestions; increments listing_count on conflict. Used by OpenClaw seed-from-titles job.';

-- ---------------------------------------------------------------------------
-- D) RLS on search_suggestions (Premium: anon/authenticated see only public)
-- ---------------------------------------------------------------------------
ALTER TABLE public.search_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_suggestions_public_select ON public.search_suggestions;
CREATE POLICY search_suggestions_public_select ON public.search_suggestions
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Service role / admin bypass RLS by default; no policy needed for them.
