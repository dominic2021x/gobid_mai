-- ============================================
-- Suggestion ranking + learning: columns, events, daily stats, indexes
-- Backward compatible: new columns have defaults; existing RPC unchanged.
-- ============================================

-- ---------------------------------------------------------------------------
-- A) Extend search_suggestions (ranking + quality)
-- ---------------------------------------------------------------------------
ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS source_priority int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS category_key text,
  ADD COLUMN IF NOT EXISTS frequency_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_score numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_score numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.search_suggestions.source_priority IS 'Higher = prefer this source when ranking (e.g. seed_titles=1, track=2).';
COMMENT ON COLUMN public.search_suggestions.channel IS 'Channel context: ro, executari_insolventa, etc.';
COMMENT ON COLUMN public.search_suggestions.category_key IS 'Category slug for context boost.';
COMMENT ON COLUMN public.search_suggestions.frequency_count IS 'Times this phrase appeared in seed/listings (denormalized).';
COMMENT ON COLUMN public.search_suggestions.last_seen_at IS 'Last time seen in a listing (recency signal).';
COMMENT ON COLUMN public.search_suggestions.quality_score IS 'Computed from CTR/behavior (0..1 scale).';
COMMENT ON COLUMN public.search_suggestions.rank_score IS 'Final ranking score (aggregation job).';
COMMENT ON COLUMN public.search_suggestions.is_active IS 'false = suppressed from suggest (quality/abuse).';

CREATE INDEX IF NOT EXISTS idx_search_suggestions_is_active_rank
  ON public.search_suggestions (is_active, rank_score DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_search_suggestions_last_seen_at
  ON public.search_suggestions (last_seen_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- B) search_suggestion_events (raw telemetry: impression, click, submit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_suggestion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid REFERENCES public.search_suggestions(id) ON DELETE SET NULL,
  query_norm text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'submit')),
  session_id_hash text,
  ip_hash text,
  channel text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.search_suggestion_events IS 'Raw suggestion telemetry for learning; aggregated into daily_stats.';

CREATE INDEX IF NOT EXISTS idx_search_suggestion_events_suggestion_id
  ON public.search_suggestion_events (suggestion_id)
  WHERE suggestion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_suggestion_events_query_norm
  ON public.search_suggestion_events (query_norm);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_events_created_at
  ON public.search_suggestion_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_events_event_type
  ON public.search_suggestion_events (event_type);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_events_channel
  ON public.search_suggestion_events (channel)
  WHERE channel IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C) search_suggestion_daily_stats (aggregated metrics per suggestion/day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_suggestion_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.search_suggestions(id) ON DELETE CASCADE,
  day date NOT NULL,
  channel text NOT NULL DEFAULT '',
  category_key text NOT NULL DEFAULT '',
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  submits int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, day, channel, category_key)
);

COMMENT ON TABLE public.search_suggestion_daily_stats IS 'Aggregated suggestion metrics per day for ranking.';

CREATE INDEX IF NOT EXISTS idx_search_suggestion_daily_stats_suggestion_id
  ON public.search_suggestion_daily_stats (suggestion_id);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_daily_stats_day
  ON public.search_suggestion_daily_stats (day DESC);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_daily_stats_channel
  ON public.search_suggestion_daily_stats (channel)
  WHERE channel <> '';

CREATE INDEX IF NOT EXISTS idx_search_suggestion_daily_stats_category_key
  ON public.search_suggestion_daily_stats (category_key)
  WHERE category_key <> '';

-- ---------------------------------------------------------------------------
-- D) RPC: fetch candidates for reranking (returns id, phrase_norm, ranking cols; limit up to 80)
-- Used by suggest route to fetch more candidates then rerank in Node.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_suggestions_candidates_rpc(
  q_norm text,
  kind_filter text DEFAULT NULL,
  lim int DEFAULT 50,
  category text DEFAULT NULL,
  subcategory text DEFAULT NULL,
  county text DEFAULT NULL,
  city text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  phrase text,
  phrase_norm text,
  kind text,
  popularity int,
  meta jsonb,
  source_priority int,
  frequency_count int,
  last_seen_at timestamptz,
  quality_score numeric,
  rank_score numeric,
  channel text,
  category_key text
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
      (CASE WHEN lim IS NULL OR lim <= 0 THEN 50 WHEN lim > 80 THEN 80 ELSE lim END) AS lim_val
  ),
  prefix_matches AS (
    SELECT
      s.id,
      s.phrase,
      s.phrase_norm,
      s.kind,
      s.popularity,
      s.meta,
      COALESCE(s.source_priority, 0) AS source_priority,
      COALESCE(s.frequency_count, 0) AS frequency_count,
      s.last_seen_at,
      COALESCE(s.quality_score, 0) AS quality_score,
      COALESCE(s.rank_score, 0) AS rank_score,
      s.channel,
      s.category_key
    FROM public.search_suggestions s
    CROSS JOIN params p
    WHERE p.q_trim <> ''
      AND length(trim(s.phrase_norm)) >= 2
      AND s.phrase_norm LIKE p.q_trim || '%'
      AND (kind_filter IS NULL OR s.kind = kind_filter)
      AND s.is_public = true
      AND s.is_active = true
    ORDER BY COALESCE(s.rank_score, 0) DESC, COALESCE(s.quality_score, 0) DESC,
             COALESCE(s.meta->>'seed_count', '0')::int DESC, s.updated_at DESC
    LIMIT 60
  ),
  fuzzy_matches AS (
    SELECT
      s.id,
      s.phrase,
      s.phrase_norm,
      s.kind,
      s.popularity,
      s.meta,
      COALESCE(s.source_priority, 0) AS source_priority,
      COALESCE(s.frequency_count, 0) AS frequency_count,
      s.last_seen_at,
      COALESCE(s.quality_score, 0) AS quality_score,
      COALESCE(s.rank_score, 0) AS rank_score,
      s.channel,
      s.category_key
    FROM public.search_suggestions s
    CROSS JOIN params p
    WHERE p.q_trim <> ''
      AND length(trim(s.phrase_norm)) >= 2
      AND s.phrase_norm NOT LIKE p.q_trim || '%'
      AND similarity(s.phrase_norm, p.q_trim) > p.min_sim
      AND (kind_filter IS NULL OR s.kind = kind_filter)
      AND s.is_public = true
      AND s.is_active = true
    ORDER BY similarity(s.phrase_norm, p.q_trim) DESC, COALESCE(s.rank_score, 0) DESC
    LIMIT 30
  ),
  combined AS (
    SELECT * FROM prefix_matches
    UNION ALL
    SELECT * FROM fuzzy_matches
  ),
  deduped AS (
    SELECT DISTINCT ON (combined.phrase_norm)
      combined.id, combined.phrase, combined.phrase_norm, combined.kind, combined.popularity, combined.meta,
      combined.source_priority, combined.frequency_count, combined.last_seen_at,
      combined.quality_score, combined.rank_score, combined.channel, combined.category_key
    FROM combined
    ORDER BY combined.phrase_norm, combined.rank_score DESC NULLS LAST, combined.quality_score DESC NULLS LAST
  )
  SELECT deduped.id, deduped.phrase, deduped.phrase_norm, deduped.kind, deduped.popularity, deduped.meta,
         deduped.source_priority, deduped.frequency_count, deduped.last_seen_at,
         deduped.quality_score, deduped.rank_score, deduped.channel, deduped.category_key
  FROM deduped
  ORDER BY deduped.rank_score DESC NULLS LAST, deduped.quality_score DESC NULLS LAST, deduped.popularity DESC
  LIMIT (SELECT lim_val FROM params);
$$;

COMMENT ON FUNCTION public.search_suggestions_candidates_rpc(text, text, int, text, text, text, text) IS
  'Returns candidates for suggest route reranking; is_active=true only; limit up to 80.';

-- ---------------------------------------------------------------------------
-- E) RPC: batch upsert daily_stats (for aggregation job; idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_suggestion_daily_stats_batch(_rows jsonb)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  r jsonb;
  cnt int := 0;
  v_sid uuid;
  v_day date;
  v_ch text;
  v_cat text;
  v_imp int;
  v_clk int;
  v_sub int;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_sid := (r->>'suggestion_id')::uuid;
    v_day := (r->>'day')::date;
    v_ch := NULLIF(trim(r->>'channel'), '');
    v_cat := NULLIF(trim(r->>'category_key'), '');
    v_imp := GREATEST(0, COALESCE((r->>'impressions')::int, 0));
    v_clk := GREATEST(0, COALESCE((r->>'clicks')::int, 0));
    v_sub := GREATEST(0, COALESCE((r->>'submits')::int, 0));
    IF v_sid IS NULL OR v_day IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.search_suggestion_daily_stats (
      suggestion_id, day, channel, category_key, impressions, clicks, submits, updated_at
    )
    VALUES (v_sid, v_day, COALESCE(v_ch, ''), COALESCE(v_cat, ''), v_imp, v_clk, v_sub, now())
    ON CONFLICT (suggestion_id, day, channel, category_key)
    DO UPDATE SET
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      submits = EXCLUDED.submits,
      updated_at = now();
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

COMMENT ON FUNCTION public.upsert_suggestion_daily_stats_batch(jsonb) IS
  'Idempotent batch upsert for search_suggestion_daily_stats (aggregation job).';
