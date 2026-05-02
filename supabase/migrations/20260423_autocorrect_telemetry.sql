-- Autocorrect telemetry: usefulness and acceptance for marketplace autocorrect layer.

CREATE TABLE IF NOT EXISTS public.search_autocorrect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'autocorrect_shown',
    'autocorrect_accepted',
    'autocorrect_ignored',
    'autocorrect_reformulated'
  )),
  original_query_norm text NOT NULL,
  suggested_query_norm text,
  confidence numeric,
  page_context text,
  session_id_hash text,
  vertical text,
  category_slug text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_autocorrect_events_created
  ON public.search_autocorrect_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_autocorrect_events_type_created
  ON public.search_autocorrect_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_autocorrect_events_original
  ON public.search_autocorrect_events (original_query_norm, created_at DESC);

COMMENT ON TABLE public.search_autocorrect_events IS 'Telemetry for soft autocorrect: shown, accepted, ignored, reformulated. Used to measure usefulness.';
