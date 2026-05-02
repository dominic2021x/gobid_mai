-- ============================================
-- Per-user rate limit for /api/assistant/chat (1 req / 2 sec across all conversations)
-- ============================================

CREATE TABLE IF NOT EXISTS public.assistant_user_rate_limit (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.assistant_user_rate_limit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own rate limit row" ON public.assistant_user_rate_limit;
CREATE POLICY "Users own rate limit row" ON public.assistant_user_rate_limit
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.assistant_user_rate_limit IS 'Ultima cerere chat per user pentru throttle global (2s).';
