-- Migration: Create user_chats and user_chat_messages for direct user-to-user conversations
-- Created: 2026-01-19
-- Description: Enables direct messaging between users without needing a product

-- Create user_chats table
CREATE TABLE IF NOT EXISTS public.user_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Asigură că user1_id < user2_id pentru a evita duplicate (același chat în ambele sensuri)
  CONSTRAINT user_chats_user_order CHECK (user1_id < user2_id),
  -- Un chat unic între doi utilizatori
  UNIQUE(user1_id, user2_id)
);

-- Create user_chat_messages table
CREATE TABLE IF NOT EXISTS public.user_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.user_chats(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  is_system_message BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_user_chats_user1 ON public.user_chats(user1_id);
CREATE INDEX IF NOT EXISTS idx_user_chats_user2 ON public.user_chats(user2_id);
CREATE INDEX IF NOT EXISTS idx_user_chats_last_message ON public.user_chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_chat_messages_chat_id ON public.user_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_messages_sender ON public.user_chat_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_messages_created_at ON public.user_chat_messages(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their chats" ON public.user_chats;
DROP POLICY IF EXISTS "Users can create chats" ON public.user_chats;
DROP POLICY IF EXISTS "Users can update their chats" ON public.user_chats;
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.user_chat_messages;
DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.user_chat_messages;

-- Politici RLS pentru user_chats
-- Utilizatorii pot vedea chat-urile în care sunt participanți
CREATE POLICY "Users can view their chats"
  ON public.user_chats
  FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Utilizatorii pot crea chat-uri (funcție helper va asigura ordinea corectă)
CREATE POLICY "Users can create chats"
  ON public.user_chats
  FOR INSERT
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Utilizatorii pot actualiza chat-urile lor (ex: last_message_at)
CREATE POLICY "Users can update their chats"
  ON public.user_chats
  FOR UPDATE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Politici RLS pentru user_chat_messages
-- Utilizatorii pot vedea mesajele din chat-urile lor
CREATE POLICY "Users can view messages in their chats"
  ON public.user_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_chats
      WHERE id = user_chat_messages.chat_id
      AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Utilizatorii pot trimite mesaje în chat-urile lor
CREATE POLICY "Users can send messages in their chats"
  ON public.user_chat_messages
  FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_chats
      WHERE id = user_chat_messages.chat_id
      AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Funcție pentru a actualiza last_message_at când se adaugă un mesaj
CREATE OR REPLACE FUNCTION update_user_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.user_chats
  SET last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS update_user_chat_last_message_trigger ON public.user_chat_messages;

-- Trigger pentru actualizare automată last_message_at
CREATE TRIGGER update_user_chat_last_message_trigger
  AFTER INSERT ON public.user_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_user_chat_last_message();

-- Funcție pentru a actualiza updated_at automat
CREATE OR REPLACE FUNCTION update_user_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS update_user_chats_updated_at_trigger ON public.user_chats;

-- Trigger pentru updated_at
CREATE TRIGGER update_user_chats_updated_at_trigger
  BEFORE UPDATE ON public.user_chats
  FOR EACH ROW
  EXECUTE FUNCTION update_user_chats_updated_at();

-- Enable Realtime pentru notificări live (conditional to avoid errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'user_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_chats;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'user_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_chat_messages;
  END IF;
END $$;

-- Comentarii pentru documentație
COMMENT ON TABLE public.user_chats IS 'Direct conversations between two users without a product';
COMMENT ON TABLE public.user_chat_messages IS 'Messages in user-to-user chats';
COMMENT ON COLUMN public.user_chats.user1_id IS 'First user (always the smaller UUID)';
COMMENT ON COLUMN public.user_chats.user2_id IS 'Second user (always the larger UUID)';
COMMENT ON COLUMN public.user_chat_messages.metadata IS 'JSON metadata for special message types (e.g., chat_request)';
