-- ============================================
-- Migration: Add is_system_message column to product_chat_messages
-- ============================================
-- Adaugă coloana is_system_message pentru a permite mesaje de sistem
-- și modifică sender_user_id pentru a permite NULL

-- Modifică sender_user_id pentru a permite NULL (pentru mesaje de sistem)
DO $$
BEGIN
  -- Verifică dacă sender_user_id are constraint NOT NULL și îl elimină
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chat_messages' 
    AND column_name = 'sender_user_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.product_chat_messages 
    ALTER COLUMN sender_user_id DROP NOT NULL;
  END IF;
END $$;

-- Adaugă coloană is_system_message dacă nu există
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chat_messages' 
    AND column_name = 'is_system_message'
  ) THEN
    ALTER TABLE public.product_chat_messages 
    ADD COLUMN is_system_message BOOLEAN DEFAULT false NOT NULL;
    
    -- Actualizează valorile existente
    UPDATE public.product_chat_messages 
    SET is_system_message = false 
    WHERE is_system_message IS NULL;
  END IF;
END $$;

-- Actualizează RLS policy pentru a permite inserarea mesajelor de sistem
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
