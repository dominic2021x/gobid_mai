-- ============================================
-- Ranking by user_count/seed_count/updated_at; re-seed protection; cleanup function
-- ============================================

-- ---------------------------------------------------------------------------
-- A) search_suggestions_rpc v8: order by user_count, seed_count, updated_at
-- (Suggest endpoint uses this RPC; response shape unchanged.)
-- ---------------------------------------------------------------------------
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
      s.updated_at,
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
    FROM main_suggestions
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
    COALESCE((deduped.meta->>'user_count')::int, 0) DESC,
    COALESCE((deduped.meta->>'seed_count')::int, 0) DESC,
    deduped.updated_at DESC,
    deduped.score DESC,
    deduped.popularity DESC
  LIMIT (CASE WHEN lim IS NULL OR lim <= 0 THEN 10 WHEN lim > 20 THEN 20 ELSE lim END);
$$;

COMMENT ON FUNCTION public.search_suggestions_rpc(text, text, int, text, text, text, text) IS
  'v8: order by user_count DESC, seed_count DESC, updated_at DESC; public-only.';

-- ---------------------------------------------------------------------------
-- B) Re-seed protection: increment seed_count only if last_seen_listing_id < incoming
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
  v_inc int;
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
          to_jsonb(GREATEST(1, COALESCE((search_suggestions.meta->>'seed_count')::int, 0) +
            CASE
              WHEN (search_suggestions.meta->>'last_seen_listing_id') IS NULL THEN 1
              WHEN _listing_id IS NULL THEN 0
              WHEN (search_suggestions.meta->>'last_seen_listing_id') < _listing_id::text THEN 1
              ELSE 0
            END))
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
  'Increments seed_count only when last_seen_listing_id < incoming (re-seed / retry safe).';

-- ---------------------------------------------------------------------------
-- C) Cleanup: remove weak seed-only suggestions (for future cron)
-- Deletes where seed_count < 2 AND user_count = 0 AND updated_at < now() - 90 days.
-- Schedule e.g. weekly via cron or Vercel cron calling an admin endpoint that runs this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_weak_seed_suggestions()
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
  WITH deleted AS (
    DELETE FROM public.search_suggestions
    WHERE COALESCE((meta->>'seed_count')::int, 0) < 2
      AND COALESCE((meta->>'user_count')::int, 0) = 0
      AND updated_at < now() - interval '90 days'
    RETURNING id
  )
  SELECT count(*)::bigint FROM deleted;
$$;

COMMENT ON FUNCTION public.cleanup_weak_seed_suggestions() IS
  'Deletes suggestions with seed_count < 2, user_count = 0, older than 90 days. For cron: call via admin endpoint or pg_cron.';
