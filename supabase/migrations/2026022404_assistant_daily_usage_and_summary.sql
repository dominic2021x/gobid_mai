-- ============================================
-- Daily quota per user + conversation summary on assistant_state
-- ============================================

-- Per-user daily message count (for 200/day quota)
CREATE TABLE IF NOT EXISTS public.assistant_daily_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Bucharest')::date,
  message_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_assistant_daily_usage_user_date
  ON public.assistant_daily_usage (user_id, usage_date);

ALTER TABLE public.assistant_daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own daily usage" ON public.assistant_daily_usage;
CREATE POLICY "Users own daily usage" ON public.assistant_daily_usage
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.assistant_daily_usage IS 'Număr mesaje per user per zi pentru quota asistent.';

-- assistant_state: summary + last summarized message (for context window)
ALTER TABLE public.assistant_state
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS last_summarized_message_id UUID REFERENCES public.assistant_messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assistant_state.summary IS 'Rezumat compact al conversației, actualizat la fiecare 20 mesaje.';
COMMENT ON COLUMN public.assistant_state.last_summarized_message_id IS 'Id-ul ultimului mesaj inclus în summary.';
