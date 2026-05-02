-- ============================================
-- Migration: Allow system messages in product_chat_messages
-- ============================================
-- Permite mesaje de sistem (sender_user_id NULL) și adaugă flag is_system_message
-- Adaugă și coloana communication_preference în product_chats

-- Adaugă coloană communication_preference în product_chats dacă nu există
ALTER TABLE public.product_chats 
  ADD COLUMN IF NOT EXISTS communication_preference TEXT DEFAULT 'chat' CHECK (communication_preference IN ('chat', 'offers_only'));

-- Modifică sender_user_id pentru a permite NULL (pentru mesaje de sistem)
ALTER TABLE public.product_chat_messages 
  ALTER COLUMN sender_user_id DROP NOT NULL;

-- Adaugă coloană is_system_message pentru a identifica mesajele de sistem
ALTER TABLE public.product_chat_messages 
  ADD COLUMN IF NOT EXISTS is_system_message BOOLEAN DEFAULT false;

-- Actualizează RLS policy pentru a permite inserarea mesajelor de sistem
-- (mesajele de sistem nu au sender_user_id, deci trebuie să permitem inserarea fără verificarea sender_user_id)
DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.product_chat_messages;
CREATE POLICY "Users can send messages in their chats"
  ON public.product_chat_messages
  FOR INSERT
  WITH CHECK (
    (
      -- Mesaj normal: sender_user_id trebuie să fie utilizatorul autentificat
      (sender_user_id IS NOT NULL AND auth.uid() = sender_user_id) OR
      -- Mesaj de sistem: is_system_message trebuie să fie true și utilizatorul trebuie să fie în chat
      (is_system_message = true AND sender_user_id IS NULL)
    ) AND
    EXISTS (
      SELECT 1 FROM public.product_chats
      WHERE product_chats.id = product_chat_messages.chat_id
      AND (product_chats.buyer_user_id = auth.uid() OR product_chats.seller_user_id = auth.uid())
    )
  );

