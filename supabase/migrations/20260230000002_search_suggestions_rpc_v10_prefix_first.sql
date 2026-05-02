-- ============================================
-- RPC v10: prefix-first strategy for instant suggestions.
-- a) prefix_matches: LIKE q_norm||'%', ORDER BY user_count, seed_count, updated_at, LIMIT 80
-- b) fuzzy_matches: trigram/similarity only when not prefix, LIMIT 40
-- c) combined = prefix UNION ALL fuzzy UNION ALL synonyms; dedup + final LIMIT unchanged.
-- Uses idx_suggest_phrase_norm_prefix, idx_search_suggestions_phrase_norm_trgm, idx_suggest_user_seed_rank.
-- ============================================

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
      END AS min_sim,
      (CASE WHEN lim IS NULL OR lim <= 0 THEN 10 WHEN lim > 20 THEN 20 ELSE lim END) AS lim_val
  ),
  prefix_matches AS (
    SELECT * FROM (
      SELECT
        s.phrase,
        s.kind,
        s.popularity,
        s.meta,
        s.updated_at,
        s.phrase_norm AS dedupe_key,
        (s.phrase ~ '[ăâîșţșțĂÂÎȘŢȚŞȚşţ]') AS has_diacritics,
        10::numeric AS score
      FROM public.search_suggestions s
      CROSS JOIN params p
      WHERE p.q_trim <> ''
        AND length(trim(s.phrase_norm)) >= 2
        AND s.phrase_norm LIKE p.q_trim || '%'
        AND (kind_filter IS NULL OR s.kind = kind_filter)
        AND s.is_public = true
      ORDER BY
        COALESCE(NULLIF(s.meta->>'user_count', '')::int, 0) DESC,
        COALESCE(NULLIF(s.meta->>'seed_count', '')::int, 0) DESC,
        s.updated_at DESC
      LIMIT 80
    ) sub
  ),
  fuzzy_matches AS (
    SELECT * FROM (
      SELECT
        s.phrase,
        s.kind,
        s.popularity,
        s.meta,
        s.updated_at,
        s.phrase_norm AS dedupe_key,
        (s.phrase ~ '[ăâîșţșțĂÂÎȘŢȚŞȚşţ]') AS has_diacritics,
        (
          (similarity(s.phrase_norm, p.q_trim)::numeric * 5::numeric)
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
        AND s.phrase_norm NOT LIKE p.q_trim || '%'
        AND similarity(s.phrase_norm, p.q_trim) > p.min_sim
        AND (kind_filter IS NULL OR s.kind = kind_filter)
        AND s.is_public = true
      ORDER BY similarity(s.phrase_norm, p.q_trim) DESC,
        COALESCE(NULLIF(s.meta->>'user_count', '')::int, 0) DESC,
        COALESCE(NULLIF(s.meta->>'seed_count', '')::int, 0) DESC,
        s.updated_at DESC
      LIMIT 40
    ) sub
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
      now()::timestamptz AS updated_at,
      syn.to_norm AS dedupe_key,
      (syn.to_phrase ~ '[ăâîșţșțĂÂÎȘŢȚŞȚşţ]') AS has_diacritics,
      (
        (syn.weight::numeric / 10::numeric)
        + 0.5::numeric
      ) AS score
    FROM syn_candidates syn
  ),
  combined AS (
    SELECT phrase, kind, popularity, meta, updated_at, dedupe_key, has_diacritics, score
    FROM prefix_matches
    UNION ALL
    SELECT phrase, kind, popularity, meta, updated_at, dedupe_key, has_diacritics, score
    FROM fuzzy_matches
    UNION ALL
    SELECT phrase, kind, popularity, meta, updated_at, dedupe_key, has_diacritics, score
    FROM syn_suggestions
  ),
  deduped AS (
    SELECT DISTINCT ON (dedupe_key)
      phrase, kind, popularity, meta, updated_at, score
    FROM combined
    ORDER BY dedupe_key, has_diacritics DESC, score DESC, popularity DESC
  )
  SELECT deduped.phrase, deduped.kind, deduped.popularity, deduped.meta, deduped.score
  FROM deduped
  ORDER BY
    COALESCE(NULLIF(deduped.meta->>'user_count', '')::int, 0) DESC,
    COALESCE(NULLIF(deduped.meta->>'seed_count', '')::int, 0) DESC,
    deduped.updated_at DESC,
    deduped.score DESC,
    deduped.popularity DESC
  LIMIT (SELECT lim_val FROM params);
$$;

COMMENT ON FUNCTION public.search_suggestions_rpc(text, text, int, text, text, text, text) IS
  'v10: prefix-first (prefix_matches 80, fuzzy_matches 40, synonyms); hardened meta cast; indexes: phrase_norm prefix, trgm, user_seed_rank.';
