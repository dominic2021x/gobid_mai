-- ============================================
-- assistant_events: log actions from chat-driven listing flow (Ollama orchestrator)
-- RLS: user can read only own events (via conversation)
-- ============================================

CREATE TABLE IF NOT EXISTS public.assistant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_events_conversation_id ON public.assistant_events (conversation_id);
CREATE INDEX IF NOT EXISTS idx_assistant_events_created_at ON public.assistant_events (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_events_type ON public.assistant_events (event_type);

ALTER TABLE public.assistant_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own events via conversation" ON public.assistant_events;
CREATE POLICY "Users read own events via conversation" ON public.assistant_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Service/backend inserts events (no auth.uid() in INSERT from server); use service role or allow insert when conversation belongs to user
DROP POLICY IF EXISTS "Users insert own events via conversation" ON public.assistant_events;
CREATE POLICY "Users insert own events via conversation" ON public.assistant_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.assistant_events IS 'Acțiuni executate de asistent (draft_created, field_updated, validated, published) pentru notificări în chat.';

-- ============================================
-- Publish rate limit: daily publish count per user (for assistant-driven publish only)
-- Create assistant_daily_usage if missing (e.g. if 2026022404 was not run)
-- ============================================

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

ALTER TABLE public.assistant_daily_usage
  ADD COLUMN IF NOT EXISTS publish_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.assistant_daily_usage.publish_count IS 'Număr de publicări efectuate prin asistent în acea zi (max 10).';
