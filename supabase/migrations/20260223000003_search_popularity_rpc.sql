-- ============================================
-- Migration: RPC increment atomic popularity pentru kind='query'
-- ============================================

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

  INSERT INTO public.search_suggestions (phrase, phrase_norm, kind, popularity, meta, updated_at)
  VALUES (
    coalesce(nullif(trim(phrase_display), ''), v_trim),
    v_trim,
    'query',
    1,
    '{}'::jsonb,
    now()
  )
  ON CONFLICT (phrase_norm, kind)
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

COMMENT ON FUNCTION public.bump_search_popularity(text, text) IS
  'Increment atomic popularity pentru sugestie query; no-op dacă q_norm gol sau < 2 caractere.';

-- Decay zilnic: scade popularity cu 2%, păstrează trenduri recente
CREATE OR REPLACE FUNCTION public.run_search_popularity_decay()
RETURNS int
LANGUAGE sql
VOLATILE
AS $$
  WITH updated AS (
    UPDATE public.search_suggestions
    SET
      popularity = greatest(0, floor(popularity * 0.98)::int),
      updated_at = now()
    WHERE popularity > 0
    RETURNING id
  )
  SELECT count(*)::int FROM updated;
$$;

COMMENT ON FUNCTION public.run_search_popularity_decay() IS
  'Decay zilnic: popularity *= 0.98, floor; returnează numărul de rânduri actualizate.';
