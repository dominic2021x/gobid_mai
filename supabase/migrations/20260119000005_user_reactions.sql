-- Migration: Create user_reactions table for Like/Dislike on user profiles
-- Created: 2026-01-19
-- Description: Allows users to give Like or Dislike to other users

-- Create user_reactions table
CREATE TABLE IF NOT EXISTS public.user_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Un user poate da doar UN tip de reacție (like SAU dislike) la un alt user
  UNIQUE(user_id, target_user_id)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_user_reactions_user_id ON public.user_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reactions_target_user_id ON public.user_reactions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reactions_reaction_type ON public.user_reactions(reaction_type);

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_reactions ENABLE ROW LEVEL SECURITY;

-- Politici RLS
-- Toată lumea poate vedea reacțiile
CREATE POLICY "Anyone can view reactions"
  ON public.user_reactions
  FOR SELECT
  USING (true);

-- Doar utilizatorii autentificați pot adăuga reacții
CREATE POLICY "Authenticated users can insert their own reactions"
  ON public.user_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Utilizatorii pot șterge doar propriile reacții
CREATE POLICY "Users can delete their own reactions"
  ON public.user_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Utilizatorii pot actualiza doar propriile reacții
CREATE POLICY "Users can update their own reactions"
  ON public.user_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Funcție pentru a actualiza updated_at automat
CREATE OR REPLACE FUNCTION update_user_reactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pentru updated_at
CREATE TRIGGER update_user_reactions_updated_at_trigger
  BEFORE UPDATE ON public.user_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_reactions_updated_at();

-- Enable Realtime pentru reactions (optional, dacă vrei updates live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reactions;

-- Comentarii pentru documentație
COMMENT ON TABLE public.user_reactions IS 'Stores user reactions (like/dislike) to other users';
COMMENT ON COLUMN public.user_reactions.user_id IS 'User who gave the reaction';
COMMENT ON COLUMN public.user_reactions.target_user_id IS 'User who received the reaction';
COMMENT ON COLUMN public.user_reactions.reaction_type IS 'Type of reaction: like or dislike';
