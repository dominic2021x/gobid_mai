-- ============================================
-- Migration: Add UPDATE policy for admin_internal_conversations
-- ============================================
-- Permite participanților și creatorului grupului să actualizeze conversațiile (pentru group_avatar, group_name, etc.)

-- Policy: Participanții pot actualiza conversațiile directe în care sunt participanți
-- Policy: Creatorul grupului sau participanții pot actualiza grupuri
CREATE POLICY "Admins can update their conversations"
  ON public.admin_internal_conversations
  FOR UPDATE
  USING (
    -- Conversații directe: utilizatorul trebuie să fie participant
    (conversation_type = 'direct' AND (participant1_id = auth.uid() OR participant2_id = auth.uid()))
    OR
    -- Grupurile: utilizatorul trebuie să fie creator sau participant
    (conversation_type = 'group' AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.admin_internal_conversation_participants
        WHERE conversation_id = admin_internal_conversations.id
        AND user_id = auth.uid()
      )
    ))
  );
