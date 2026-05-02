-- ============================================
-- Migration: Fix INSERT policy for admin_internal_conversation_participants
-- ============================================
-- Permite creatorului să adauge participanți (inclusiv pe el însuși) la crearea grupului

-- Drop existing policy
DROP POLICY IF EXISTS "Admins can add participants to groups" ON public.admin_internal_conversation_participants;

-- Create improved policy that allows:
-- 1. Creator to add any participants (including themselves)
-- 2. Users to add themselves when being added by the creator
CREATE POLICY "Admins can add participants to groups"
  ON public.admin_internal_conversation_participants
  FOR INSERT
  WITH CHECK (
    -- Creator can add any participants
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.conversation_type = 'group'
      AND c.created_by = auth.uid()
    )
    OR
    -- User can add themselves if the group exists and was created by someone
    (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.conversation_type = 'group'
      AND c.created_by IS NOT NULL
    ))
  );
