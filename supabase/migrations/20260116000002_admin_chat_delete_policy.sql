-- ============================================
-- Migration: Add DELETE policies for admin internal chat
-- ============================================
-- Permite DOAR adminilor (nu managerilor) să șteargă mesajele proprii și conversațiile

-- Șterge policy-urile existente dacă există (pentru a le recrea cu restricții mai stricte)
DROP POLICY IF EXISTS "Admins can delete their own messages" ON public.admin_internal_messages;
DROP POLICY IF EXISTS "Only admins can delete their own messages" ON public.admin_internal_messages;
DROP POLICY IF EXISTS "Admins can delete their conversations" ON public.admin_internal_conversations;
DROP POLICY IF EXISTS "Only admins can delete conversations" ON public.admin_internal_conversations;

-- Policy: DOAR adminii pot șterge mesajele proprii (nu managerii)
CREATE POLICY "Only admins can delete their own messages"
  ON public.admin_internal_messages
  FOR DELETE
  USING (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND (
        -- Conversații directe
        (c.conversation_type = 'direct' AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid()))
        OR
        -- Grupurile
        (c.conversation_type = 'group' AND EXISTS (
          SELECT 1 FROM public.admin_internal_conversation_participants p
          WHERE p.conversation_id = c.id
          AND p.user_id = auth.uid()
        ))
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

-- Policy: DOAR adminii pot șterge conversațiile (nu managerii)
-- Pentru conversații directe: participant trebuie să fie admin
-- Pentru grupurile: creator sau participant (care este admin) poate șterge
CREATE POLICY "Only admins can delete conversations"
  ON public.admin_internal_conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
    AND (
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
    )
  );
