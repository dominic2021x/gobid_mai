-- Migration: Update message_reactions to support any emoji (WhatsApp style)
-- Created: 2026-01-19
-- Description: Changes reaction_type from like/unlike to any emoji

-- Șterge constraint-ul vechi pentru reaction_type
ALTER TABLE public.message_reactions 
  DROP CONSTRAINT IF EXISTS message_reactions_reaction_type_check;

-- Modifică unique constraint pentru a permite multiple emoji-uri diferite de la același user
ALTER TABLE public.message_reactions 
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_message_type_user_id_reaction_ty_key;

-- Adaugă unique constraint nou: un user poate da UN SINGUR emoji de fiecare tip per mesaj
-- Dar poate da emoji-uri diferite la același mesaj
ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_unique_user_emoji_per_message
  UNIQUE(message_id, message_type, user_id, reaction_type);

-- Modifică coloana reaction_type să accepte orice text (emoji)
-- Păstrăm NOT NULL constraint
ALTER TABLE public.message_reactions 
  ALTER COLUMN reaction_type TYPE TEXT;

-- Adaugă un check simplu că reaction_type nu este gol
ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_reaction_type_not_empty
  CHECK (length(trim(reaction_type)) > 0);

-- Enable Realtime pentru reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
