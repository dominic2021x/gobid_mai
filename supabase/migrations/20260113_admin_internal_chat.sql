-- ============================================
-- Migration: Admin Internal Chat System
-- ============================================
-- Tabele pentru chat-ul intern între administratori și manageri

-- Tabel pentru conversațiile interne admin
CREATE TABLE IF NOT EXISTS public.admin_internal_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(participant1_id, participant2_id),
  CHECK (participant1_id != participant2_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_internal_conv_p1 
  ON public.admin_internal_conversations(participant1_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_internal_conv_p2 
  ON public.admin_internal_conversations(participant2_id, last_message_at DESC);

CREATE TRIGGER trg_admin_internal_conv_updated_at
BEFORE UPDATE ON public.admin_internal_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tabel pentru mesajele din chat-ul intern admin
CREATE TABLE IF NOT EXISTS public.admin_internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.admin_internal_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_admin_internal_messages_conv 
  ON public.admin_internal_messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_admin_internal_messages_sender 
  ON public.admin_internal_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_admin_internal_messages_read 
  ON public.admin_internal_messages(conversation_id, read_at) WHERE read_at IS NULL;

-- RLS Policies
ALTER TABLE public.admin_internal_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_internal_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Admini și manageri pot vedea conversațiile în care sunt participanți
CREATE POLICY "Admins can view their conversations"
  ON public.admin_internal_conversations
  FOR SELECT
  USING (
    participant1_id = auth.uid() OR participant2_id = auth.uid()
  );

-- Policy: Admini și manageri pot crea conversații
CREATE POLICY "Admins can create conversations"
  ON public.admin_internal_conversations
  FOR INSERT
  WITH CHECK (
    participant1_id = auth.uid() OR participant2_id = auth.uid()
  );

-- Policy: Admini și manageri pot vedea mesajele din conversațiile lor
CREATE POLICY "Admins can view their messages"
  ON public.admin_internal_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations
      WHERE id = conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Policy: Admini și manageri pot crea mesaje
CREATE POLICY "Admins can create messages"
  ON public.admin_internal_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_internal_conversations
      WHERE id = conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Policy: Admini și manageri pot actualiza mesajele (mark as read)
CREATE POLICY "Admins can update messages"
  ON public.admin_internal_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations
      WHERE id = conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Enable Realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_internal_messages;
