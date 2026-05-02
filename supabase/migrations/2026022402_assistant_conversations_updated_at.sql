-- ============================================
-- Add updated_at to assistant_conversations and keep it in sync on new message
-- ============================================

ALTER TABLE public.assistant_conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_updated_at
  ON public.assistant_conversations (updated_at DESC NULLS LAST);

COMMENT ON COLUMN public.assistant_conversations.updated_at IS 'Actualizat la ultimul mesaj sau la modificarea conversației';

-- Trigger: when a message is inserted, update the conversation's updated_at
CREATE OR REPLACE FUNCTION public.assistant_conversation_updated_at_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.assistant_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assistant_conversation_updated_at_trigger ON public.assistant_messages;
CREATE TRIGGER assistant_conversation_updated_at_trigger
  AFTER INSERT ON public.assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.assistant_conversation_updated_at_on_message();

-- Backfill: set updated_at = created_at for existing rows where updated_at might be missing
UPDATE public.assistant_conversations
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;
