-- Daily aggregated autocorrect stats for tuning and analytics.

CREATE TABLE IF NOT EXISTS public.search_autocorrect_daily_stats (
  day date NOT NULL,
  original_query_norm text NOT NULL,
  suggested_query_norm text NOT NULL DEFAULT '',
  page_context text NOT NULL DEFAULT '',
  shown_count int NOT NULL DEFAULT 0,
  accepted_count int NOT NULL DEFAULT 0,
  ignored_count int NOT NULL DEFAULT 0,
  reformulated_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, original_query_norm, suggested_query_norm, page_context)
);

CREATE INDEX IF NOT EXISTS idx_search_autocorrect_daily_stats_day
  ON public.search_autocorrect_daily_stats (day DESC);
CREATE INDEX IF NOT EXISTS idx_search_autocorrect_daily_stats_original
  ON public.search_autocorrect_daily_stats (original_query_norm, day DESC);

COMMENT ON TABLE public.search_autocorrect_daily_stats IS 'Daily aggregates from search_autocorrect_events for acceptance/ignore/reformulate rates.';
