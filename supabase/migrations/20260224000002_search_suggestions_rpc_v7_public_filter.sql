-- ============================================
-- Migration v7: filter to public suggestions only (no token-gated / Executări & Insolvență)
-- Requires: 20260224_search_suggestions_is_public.sql (is_public column).
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.search_suggestions_rpc(
  q_norm text,
  kind_filter text DEFAULT NULL,
  lim int DEFAULT 10,
  category text DEFAULT NULL,
  subcategory text DEFAULT NULL,
  county text DEFAULT NULL,
  city text DEFAULT NULL
)
RETURNS TABLE(
  phrase text,
  kind text,
  popularity int,
  meta jsonb,
  score numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      trim(coalesce(q_norm, '')) AS q_trim,
      length(trim(coalesce(q_norm, ''))) AS q_len,
      CASE
        WHEN length(trim(coalesce(q_norm, ''))) <= 2 THEN 0.35::numeric
        WHEN length(trim(coalesce(q_norm, ''))) <= 4 THEN 0.22::numeric
        ELSE 0.10::numeric
      END AS min_sim
  ),
  main_suggestions AS (
    SELECT
      s.phrase,
      s.kind,
      s.popularity,
      s.meta,
      s.phrase_norm AS dedupe_key,
      (s.phrase ~ '[ăâîșţșțĂÂÎȘŢȚŞȚşţ]') AS has_diacritics,
      (
        (CASE WHEN s.phrase_norm LIKE p.q_trim || '%' THEN 10 ELSE 0 END)::numeric
        + (similarity(s.phrase_norm, p.q_trim)::numeric * 5::numeric)
        + (least(s.popularity, 1000)::numeric / 200::numeric)
        + (CASE WHEN category IS NOT NULL AND trim(coalesce(s.meta->>'category', '')) = trim(coalesce(category, '')) THEN 2::numeric ELSE 0::numeric END)
        + (CASE WHEN subcategory IS NOT NULL AND trim(coalesce(s.meta->>'subcategory', '')) = trim(coalesce(subcategory, '')) THEN 3::numeric ELSE 0::numeric END)
        + (CASE WHEN county IS NOT NULL AND trim(coalesce(s.meta->>'county', '')) = trim(coalesce(county, '')) THEN 1.5::numeric ELSE 0::numeric END)
        + (CASE WHEN city IS NOT NULL AND trim(coalesce(s.meta->>'city', '')) = trim(coalesce(city, '')) THEN 2::numeric ELSE 0::numeric END)
      ) AS score
    FROM public.search_suggestions s
    CROSS JOIN params p
    WHERE p.q_trim <> ''
      AND length(trim(s.phrase_norm)) >= 2
      AND (s.phrase_norm LIKE p.q_trim || '%' OR similarity(s.phrase_norm, p.q_trim) > p.min_sim)
      AND (kind_filter IS NULL OR s.kind = kind_filter)
      AND (s.is_public = true)
  ),
  syn_candidates AS (
    SELECT sub.to_phrase, sub.to_norm, sub.weight
    FROM (
      SELECT s.to_phrase, s.to_norm, s.weight
      FROM public.search_suggestion_synonyms s
      CROSS JOIN params p
      WHERE (s.from_norm = p.q_trim OR s.from_norm LIKE p.q_trim || '%')
        AND p.q_len >= 2
      ORDER BY s.weight DESC
      LIMIT 20
    ) sub
  ),
  syn_suggestions AS (
    SELECT
      syn.to_phrase AS phrase,
      'query'::text AS kind,
      0 AS popularity,
      '{}'::jsonb AS meta,
      syn.to_norm AS dedupe_key,
      (syn.to_phrase ~ '[ăâîșţșțĂÂÎȘŢȚŞȚşţ]') AS has_diacritics,
      (
        (syn.weight::numeric / 10::numeric)
        + 0.5::numeric
      ) AS score
    FROM syn_candidates syn
  ),
  combined AS (
    SELECT phrase, kind, popularity, meta, dedupe_key, has_diacritics, score
    FROM main_suggestions
    UNION ALL
    SELECT phrase, kind, popularity, meta, dedupe_key, has_diacritics, score
    FROM syn_suggestions
  ),
  deduped AS (
    SELECT DISTINCT ON (dedupe_key)
      phrase, kind, popularity, meta, score
    FROM combined
    ORDER BY dedupe_key, has_diacritics DESC, score DESC, popularity DESC
  )
  SELECT deduped.phrase, deduped.kind, deduped.popularity, deduped.meta, deduped.score
  FROM deduped
  ORDER BY deduped.score DESC, deduped.popularity DESC
  LIMIT (CASE WHEN lim IS NULL OR lim <= 0 THEN 10 WHEN lim > 20 THEN 20 ELSE lim END);
$$;

COMMENT ON FUNCTION public.search_suggestions_rpc(text, text, int, text, text, text, text) IS
  'v7: public-only (is_public = true); no token-gated / Executări & Insolvență in public suggest.';
