-- ============================================
-- Migration: Admin Internal Chat Groups Support
-- ============================================
-- Adaugă suport pentru grupuri în chat-ul intern admin

-- Nu mai folosim funcția helper - o eliminăm dacă există
DROP FUNCTION IF EXISTS public.is_conversation_participant(UUID, UUID);

-- Elimină constrângerile vechi pentru a permite grupuri
DO $$
BEGIN
  -- Elimină UNIQUE constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.admin_internal_conversations'::regclass
    AND conname = 'admin_internal_conversations_participant1_id_participant2_id_key'
  ) THEN
    ALTER TABLE public.admin_internal_conversations 
    DROP CONSTRAINT admin_internal_conversations_participant1_id_participant2_id_key;
  END IF;
  
  -- Elimină CHECK constraint (numele poate varia, deci căutăm după tip)
  ALTER TABLE public.admin_internal_conversations 
  DROP CONSTRAINT IF EXISTS admin_internal_conversations_participant1_id_check;
END $$;

-- Face participant1_id și participant2_id nullable pentru grupuri
ALTER TABLE public.admin_internal_conversations 
  ALTER COLUMN participant1_id DROP NOT NULL,
  ALTER COLUMN participant2_id DROP NOT NULL;

-- Adaugă câmpul conversation_type pentru a diferenția conversații individuale de grupuri
ALTER TABLE public.admin_internal_conversations 
  ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS group_avatar TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Adaugă constrângere pentru conversații directe (participant1_id != participant2_id doar pentru direct)
ALTER TABLE public.admin_internal_conversations 
  DROP CONSTRAINT IF EXISTS admin_internal_conversations_direct_check;

ALTER TABLE public.admin_internal_conversations 
  ADD CONSTRAINT admin_internal_conversations_direct_check 
  CHECK (
    conversation_type = 'group' 
    OR (conversation_type = 'direct' AND participant1_id IS NOT NULL AND participant2_id IS NOT NULL AND participant1_id != participant2_id)
  );

-- Adaugă constrângere UNIQUE doar pentru conversații directe
CREATE UNIQUE INDEX IF NOT EXISTS admin_internal_conversations_direct_unique 
  ON public.admin_internal_conversations(participant1_id, participant2_id) 
  WHERE conversation_type = 'direct';

-- Tabel pentru participanții la grupuri (pentru grupuri, nu folosim participant1_id/participant2_id)
CREATE TABLE IF NOT EXISTS public.admin_internal_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.admin_internal_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_conv_participants_conv 
  ON public.admin_internal_conversation_participants(conversation_id);

CREATE INDEX IF NOT EXISTS idx_admin_conv_participants_user 
  ON public.admin_internal_conversation_participants(user_id);

-- RLS Policies pentru participanți
ALTER TABLE public.admin_internal_conversation_participants ENABLE ROW LEVEL SECURITY;

-- Policy: Utilizatorii pot vedea participanții din conversațiile lor
-- Pentru a evita recursiune, folosim o verificare simplă directă:
-- - Pentru conversații directe: verificăm direct dacă user_id = auth.uid() (utilizatorul își poate vedea propriul rând)
--   SAU dacă conversația este directă și utilizatorul este participant
-- - Pentru grupuri: utilizatorul poate vedea participanții dacă este participant (user_id = auth.uid() pentru rândul său)
--   SAU dacă este creatorul grupului (verificăm prin admin_internal_conversations, dar doar created_by, nu participanții)
DROP POLICY IF EXISTS "Admins can view participants in their conversations" ON public.admin_internal_conversation_participants;
CREATE POLICY "Admins can view participants in their conversations"
  ON public.admin_internal_conversation_participants
  FOR SELECT
  USING (
    -- Utilizatorul își poate vedea propriul rând (pentru a evita recursiune)
    user_id = auth.uid()
    OR
    -- Conversații directe: verificăm direct prin admin_internal_conversations (doar participant1_id și participant2_id, fără verificare de participanți)
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.conversation_type = 'direct'
      AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
    OR
    -- Grupuri: verificăm doar created_by (nu participanții) pentru a evita recursiune
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.conversation_type = 'group'
      AND c.created_by = auth.uid()
    )
  );

-- Policy: Utilizatorii pot adăuga participanți în grupuri (doar creatorul grupului)
-- Simplificat pentru a evita recursiune - doar creatorul poate adăuga participanți
DROP POLICY IF EXISTS "Admins can add participants to groups" ON public.admin_internal_conversation_participants;
CREATE POLICY "Admins can add participants to groups"
  ON public.admin_internal_conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.conversation_type = 'group'
      AND c.created_by = auth.uid()
    )
  );

-- Policy: Utilizatorii pot elimina participanți din grupuri (doar creatorul grupului sau utilizatorul însuși)
DROP POLICY IF EXISTS "Admins can remove participants from groups" ON public.admin_internal_conversation_participants;
CREATE POLICY "Admins can remove participants from groups"
  ON public.admin_internal_conversation_participants
  FOR DELETE
  USING (
    user_id = auth.uid() -- Poate ieși singur
    OR EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND c.created_by = auth.uid()
    )
  );

-- Migrare date existente: pentru conversații directe existente, creăm participanți
INSERT INTO public.admin_internal_conversation_participants (conversation_id, user_id, joined_at, role)
SELECT id, participant1_id, created_at, 'member'
FROM public.admin_internal_conversations
WHERE conversation_type = 'direct'
AND NOT EXISTS (
  SELECT 1 FROM public.admin_internal_conversation_participants p
  WHERE p.conversation_id = admin_internal_conversations.id
  AND p.user_id = participant1_id
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO public.admin_internal_conversation_participants (conversation_id, user_id, joined_at, role)
SELECT id, participant2_id, created_at, 'member'
FROM public.admin_internal_conversations
WHERE conversation_type = 'direct'
AND NOT EXISTS (
  SELECT 1 FROM public.admin_internal_conversation_participants p
  WHERE p.conversation_id = admin_internal_conversations.id
  AND p.user_id = participant2_id
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Actualizare RLS Policies pentru admin_internal_conversations pentru a suporta grupuri
-- Pentru grupuri, permitem doar creatorul să vadă grupul la început (participanții vor fi verificați la nivel de aplicație)
-- Asta evită complet recursiunea
DROP POLICY IF EXISTS "Admins can view their conversations" ON public.admin_internal_conversations;
CREATE POLICY "Admins can view their conversations"
  ON public.admin_internal_conversations
  FOR SELECT
  USING (
    -- Conversații directe: participant1_id sau participant2_id
    (conversation_type = 'direct' AND (participant1_id = auth.uid() OR participant2_id = auth.uid()))
    OR
    -- Grupuri: utilizatorul este creatorul grupului (participanții vor fi verificați prin query-uri separate)
    (conversation_type = 'group' AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can create conversations" ON public.admin_internal_conversations;
CREATE POLICY "Admins can create conversations"
  ON public.admin_internal_conversations
  FOR INSERT
  WITH CHECK (
    -- Conversații directe: utilizatorul este participant1 sau participant2
    (conversation_type = 'direct' AND (participant1_id = auth.uid() OR participant2_id = auth.uid()))
    OR
    -- Grupuri: utilizatorul este creatorul grupului
    (conversation_type = 'group' AND created_by = auth.uid())
  );

-- Actualizare RLS Policies pentru admin_internal_messages pentru a suporta grupuri
DROP POLICY IF EXISTS "Admins can view their messages" ON public.admin_internal_messages;
CREATE POLICY "Admins can view their messages"
  ON public.admin_internal_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND (
        -- Conversații directe
        (c.conversation_type = 'direct' AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid()))
        OR
        -- Grupuri
        (c.conversation_type = 'group' AND EXISTS (
          SELECT 1 FROM public.admin_internal_conversation_participants p
          WHERE p.conversation_id = c.id
          AND p.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Admins can create messages" ON public.admin_internal_messages;
CREATE POLICY "Admins can create messages"
  ON public.admin_internal_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND (
        -- Conversații directe
        (c.conversation_type = 'direct' AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid()))
        OR
        -- Grupuri
        (c.conversation_type = 'group' AND EXISTS (
          SELECT 1 FROM public.admin_internal_conversation_participants p
          WHERE p.conversation_id = c.id
          AND p.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Admins can update messages" ON public.admin_internal_messages;
CREATE POLICY "Admins can update messages"
  ON public.admin_internal_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_internal_conversations c
      WHERE c.id = conversation_id
      AND (
        -- Conversații directe
        (c.conversation_type = 'direct' AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid()))
        OR
        -- Grupuri
        (c.conversation_type = 'group' AND EXISTS (
          SELECT 1 FROM public.admin_internal_conversation_participants p
          WHERE p.conversation_id = c.id
          AND p.user_id = auth.uid()
        ))
      )
    )
  );
