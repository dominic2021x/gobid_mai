-- Migration: Create message_reactions table for like/unlike functionality
-- Created: 2026-01-19
-- Description: Allows users to like/unlike messages in product chats and report chats

-- Tabel pentru reactions la mesaje (like/unlike)
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('product_chat', 'report_chat')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'unlike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(message_id, message_type, user_id, reaction_type)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_message_reactions_message 
  ON public.message_reactions(message_id, message_type);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user 
  ON public.message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_type 
  ON public.message_reactions(reaction_type);

-- Trigger pentru updated_at
CREATE OR REPLACE FUNCTION public.set_message_reactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_reactions_updated_at();

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all reactions (for counts)
DROP POLICY IF EXISTS "Users can view message reactions" ON public.message_reactions;
CREATE POLICY "Users can view message reactions"
  ON public.message_reactions
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own reactions
DROP POLICY IF EXISTS "Users can insert their own reactions" ON public.message_reactions;
CREATE POLICY "Users can insert their own reactions"
  ON public.message_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own reactions
DROP POLICY IF EXISTS "Users can update their own reactions" ON public.message_reactions;
CREATE POLICY "Users can update their own reactions"
  ON public.message_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reactions
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;
CREATE POLICY "Users can delete their own reactions"
  ON public.message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);
