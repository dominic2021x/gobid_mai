-- ============================================
-- Migration: search_events – evenimente submit search (observabilitate)
-- ============================================

CREATE TABLE IF NOT EXISTS public.search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  q text NOT NULL,
  q_norm text NOT NULL,
  ip_hash text,
  user_id uuid,
  CONSTRAINT search_events_q_norm_not_empty CHECK (length(trim(q_norm)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_search_events_created_at
  ON public.search_events (created_at);

CREATE INDEX IF NOT EXISTS idx_search_events_q_norm
  ON public.search_events (q_norm);

CREATE INDEX IF NOT EXISTS idx_search_events_ip_hash_q_norm_created
  ON public.search_events (ip_hash, q_norm, created_at DESC);

CREATE INDEX IF NOT EXISTS search_events_user_qnorm_created_at_idx
  ON public.search_events (user_id, q_norm, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_events_user_created_at_idx
  ON public.search_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.search_events IS 'Evenimente submit search pentru popularity pipeline; ip_hash = hash pe IP, nu IP raw.';
