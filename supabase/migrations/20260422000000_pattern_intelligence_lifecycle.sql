-- ============================================
-- Pattern intelligence: suppression lifecycle, query-suggestion stats, taxonomy geo
-- ============================================

-- A) search_suggestions: auto-suppression columns (no hard delete)
ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS auto_suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suppression_reason text;

COMMENT ON COLUMN public.search_suggestions.auto_suppressed_at IS 'When this suggestion was auto-suppressed (is_active=false) by lifecycle rules.';
COMMENT ON COLUMN public.search_suggestions.suppression_reason IS 'Reason code: zero_clicks_high_impressions, low_ctr_high_impressions, weak_pattern.';

CREATE INDEX IF NOT EXISTS idx_search_suggestions_auto_suppressed
  ON public.search_suggestions (auto_suppressed_at DESC NULLS LAST)
  WHERE auto_suppressed_at IS NOT NULL;

-- B) search_query_suggestion_stats: add submits for affinity (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'search_query_suggestion_stats' AND column_name = 'submits'
  ) THEN
    ALTER TABLE public.search_query_suggestion_stats ADD COLUMN submits int NOT NULL DEFAULT 0;
  END IF;
END $$;

COMMENT ON TABLE public.search_query_suggestion_stats IS 'Per-query per-suggestion engagement for suggest rerank and query affinity.';

-- C) search_taxonomy_terms: allow geo term types for expansion
ALTER TABLE public.search_taxonomy_terms
  DROP CONSTRAINT IF EXISTS search_taxonomy_terms_term_type_check;

ALTER TABLE public.search_taxonomy_terms
  ADD CONSTRAINT search_taxonomy_terms_term_type_check
  CHECK (term_type IN ('category', 'subcategory', 'attribute_key', 'geo_county', 'geo_city'));

-- D) RPC: apply auto-suppression to suggestions meeting lifecycle rules (safe thresholds, no delete)
CREATE OR REPLACE FUNCTION public.search_suggestions_apply_auto_suppression(
  p_min_impressions int DEFAULT 50,
  p_zero_click_suppress boolean DEFAULT true,
  p_low_ctr_threshold numeric DEFAULT 0.02,
  p_low_ctr_impressions_min int DEFAULT 30,
  p_max_to_update int DEFAULT 200
)
RETURNS TABLE(
  updated_id uuid,
  phrase_norm text,
  suppression_reason text,
  had_impressions bigint,
  had_clicks bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_updated int := 0;
BEGIN
  FOR v_row IN
    SELECT s.id, s.phrase_norm,
           COALESCE(SUM(st.impressions), 0)::bigint AS imp,
           COALESCE(SUM(st.clicks), 0)::bigint AS clk
    FROM search_suggestions s
    LEFT JOIN (
      SELECT suggestion_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks
      FROM search_suggestion_daily_stats
      WHERE day >= current_date - 30
      GROUP BY suggestion_id
    ) st ON st.suggestion_id = s.id
    WHERE s.is_active = true
      AND s.is_public = true
      AND s.kind = 'query'
      AND s.auto_suppressed_at IS NULL
    GROUP BY s.id, s.phrase_norm
    HAVING COALESCE(SUM(st.impressions), 0) >= p_min_impressions
    LIMIT p_max_to_update
  LOOP
    IF (p_zero_click_suppress AND v_row.clk = 0) OR
       (v_row.imp >= p_low_ctr_impressions_min AND v_row.clk > 0 AND (v_row.clk::numeric / NULLIF(v_row.imp, 0)) < p_low_ctr_threshold) THEN
      UPDATE search_suggestions
      SET is_active = false,
          auto_suppressed_at = now(),
          suppression_reason = CASE
            WHEN v_row.clk = 0 THEN 'zero_clicks_high_impressions'
            ELSE 'low_ctr_high_impressions'
          END
      WHERE id = v_row.id;
      v_updated := v_updated + 1;
      updated_id := v_row.id;
      phrase_norm := v_row.phrase_norm;
      suppression_reason := CASE WHEN v_row.clk = 0 THEN 'zero_clicks_high_impressions' ELSE 'low_ctr_high_impressions' END;
      had_impressions := v_row.imp;
      had_clicks := v_row.clk;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.search_suggestions_apply_auto_suppression IS 'Marks suggestions as inactive when they meet suppression rules (high impressions, zero or very low clicks). No rows deleted.';
