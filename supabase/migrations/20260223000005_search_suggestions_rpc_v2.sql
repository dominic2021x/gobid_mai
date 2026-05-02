-- ============================================
-- Migration v2: RPC sugestii – dedupe pe norm, prag similarity adaptiv, preferință diacritice
-- Nu schimbă semnătura sau return type; doar logica internă.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
DECLARE
  q_trim text;
  min_sim numeric;
BEGIN
  q_trim := trim(coalesce(q_norm, ''));
  IF q_trim = '' THEN
    RETURN;
  END IF;

  -- Prag similarity adaptiv: input scurt = mai strict (mai puțin zgomot)
  IF length(q_trim) <= 2 THEN
    min_sim := 0.35;
  ELSIF length(q_trim) <= 4 THEN
    min_sim := 0.22;
  ELSE
    min_sim := 0.10;
  END IF;

  RETURN QUERY
  SELECT d.phrase, d.kind, d.popularity, d.meta, d.score
  FROM (
    SELECT DISTINCT ON (combined.dedupe_key)
      combined.phrase,
      combined.kind,
      combined.popularity,
      combined.meta,
      combined.score
    FROM (
      -- Sugestii principale: dedupe_key = phrase_norm
      SELECT
        s.phrase,
        s.kind,
        s.popularity,
        s.meta,
        s.phrase_norm AS dedupe_key,
        (s.phrase ~ '[ăâîșțĂÂÎȘȚ]') AS has_diacritics,
        (CASE WHEN s.phrase_norm LIKE q_trim || '%' THEN 10 ELSE 0 END)
          + (similarity(s.phrase_norm, q_trim) * 5)
          + (least(s.popularity, 1000) / 200.0) AS score
      FROM public.search_suggestions s
      WHERE length(trim(s.phrase_norm)) >= 2
        AND (s.phrase_norm LIKE q_trim || '%' OR similarity(s.phrase_norm, q_trim) > min_sim)
        AND (kind_filter IS NULL OR s.kind = kind_filter)

      UNION ALL

      -- Sinonime: doar dacă q_norm >= 2 caractere; max 20 candidate; dedupe_key = to_norm
      SELECT
        syn.to_phrase AS phrase,
        'query'::text AS kind,
        0 AS popularity,
        '{}'::jsonb AS meta,
        syn.to_norm AS dedupe_key,
        (syn.to_phrase ~ '[ăâîșțĂÂÎȘȚ]') AS has_diacritics,
        (syn.weight / 10.0) + 0.5 AS score
      FROM (
        SELECT to_phrase, to_norm, weight
        FROM public.search_suggestion_synonyms
        WHERE from_norm = q_trim OR from_norm LIKE q_trim || '%'
        ORDER BY weight DESC
        LIMIT 20
      ) syn
    ) combined
    ORDER BY combined.dedupe_key, combined.has_diacritics DESC, combined.score DESC, combined.popularity DESC
  ) d
  ORDER BY d.score DESC, d.popularity DESC
  LIMIT lim;
END;
$$;

COMMENT ON FUNCTION public.search_suggestions_rpc(text, text, int) IS
  'v2: Dedupe pe cheie normalizată, prag similarity adaptiv, preferință diacritice în phrase.';
