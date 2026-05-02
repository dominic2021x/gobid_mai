-- ============================================
-- Migration: RPC pentru ranking sugestii – un singur round-trip Postgres
-- Folosește pg_trgm (similarity + prefix), popularity, opțional sinonime.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Funcție STABLE, fără SECURITY DEFINER (rulează cu permisiunile caller-ului, ex. service role).
CREATE OR REPLACE FUNCTION public.search_suggestions_rpc(
  q_norm text,
  kind_filter text DEFAULT NULL,
  lim int DEFAULT 10
)
RETURNS TABLE(
  phrase text,
  kind text,
  popularity int,
  meta jsonb,
  score numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF trim(coalesce(q_norm, '')) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.phrase, d.kind, d.popularity, d.meta, d.score
  FROM (
    SELECT DISTINCT ON (combined.phrase)
      combined.phrase,
      combined.kind,
      combined.popularity,
      combined.meta,
      combined.score
    FROM (
      -- Sugestii principale: prefix boost + similarity + popularity
      SELECT
        s.phrase,
        s.kind,
        s.popularity,
        s.meta,
        (CASE WHEN s.phrase_norm LIKE q_norm || '%' THEN 10 ELSE 0 END)
          + (similarity(s.phrase_norm, q_norm) * 5)
          + (least(s.popularity, 1000) / 200.0) AS score
      FROM public.search_suggestions s
      WHERE length(trim(s.phrase_norm)) >= 2
        AND (s.phrase_norm LIKE q_norm || '%' OR similarity(s.phrase_norm, q_norm) > 0.1)
        AND (kind_filter IS NULL OR s.kind = kind_filter)

      UNION ALL

      -- Sinonime: from_norm exact sau prefix
      SELECT
        syn.to_phrase AS phrase,
        'query'::text AS kind,
        0 AS popularity,
        '{}'::jsonb AS meta,
        (syn.weight / 10.0) + 0.5 AS score
      FROM public.search_suggestion_synonyms syn
      WHERE syn.from_norm = q_norm OR syn.from_norm LIKE q_norm || '%'
    ) combined
    ORDER BY combined.phrase, combined.score DESC
  ) d
  ORDER BY d.score DESC, d.popularity DESC
  LIMIT lim;
END;
$$;

COMMENT ON FUNCTION public.search_suggestions_rpc(text, text, int) IS
  'Ranking sugestii RO: prefix boost, trigram similarity, popularity; opțional sinonime. Un singur round-trip.';
