-- ============================================
-- assistant_events: add user_id for Realtime / indexes
-- Enable Realtime for chat-visible notifications
-- ============================================

-- Denormalize user_id from conversation for indexing and Realtime filtering
ALTER TABLE public.assistant_events
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill user_id from conversation
UPDATE public.assistant_events e
SET user_id = c.user_id
FROM public.assistant_conversations c
WHERE e.conversation_id = c.id AND e.user_id IS NULL;

-- Index for Realtime subscription: list events by user, newest first
CREATE INDEX IF NOT EXISTS idx_assistant_events_user_created
  ON public.assistant_events (user_id, created_at DESC);

-- RLS: allow SELECT by user (already have via conversation; keep both for clarity)
DROP POLICY IF EXISTS "Users read own events via conversation" ON public.assistant_events;
CREATE POLICY "Users read own events via conversation" ON public.assistant_events
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- INSERT: set user_id when inserting (conversation belongs to user)
DROP POLICY IF EXISTS "Users insert own events via conversation" ON public.assistant_events;
CREATE POLICY "Users insert own events via conversation" ON public.assistant_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Enable Realtime: run in Supabase Dashboard (Database → Replication) or uncomment:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.assistant_events;

COMMENT ON COLUMN public.assistant_events.user_id IS 'Denormalized from conversation for Realtime and indexes.';
