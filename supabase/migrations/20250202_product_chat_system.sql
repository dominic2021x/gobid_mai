-- ============================================
-- Migration: Product Chat System
-- ============================================
-- Creează tabele pentru chat între cumpărător și vânzător pentru produse

-- Tabelul pentru conversațiile legate de produse
CREATE TABLE IF NOT EXISTS public.product_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- O singură conversație per produs per cumpărător
  UNIQUE(product_id, buyer_user_id)
);

-- Indexuri pentru product_chats
CREATE INDEX IF NOT EXISTS idx_product_chats_product ON public.product_chats(product_id);
CREATE INDEX IF NOT EXISTS idx_product_chats_buyer ON public.product_chats(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_product_chats_seller ON public.product_chats(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_product_chats_last_message ON public.product_chats(last_message_at DESC);

-- Tabelul pentru mesajele din chat
CREATE TABLE IF NOT EXISTS public.product_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.product_chats(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexuri pentru product_chat_messages
CREATE INDEX IF NOT EXISTS idx_product_chat_messages_chat ON public.product_chat_messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_product_chat_messages_sender ON public.product_chat_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_product_chat_messages_unread ON public.product_chat_messages(chat_id, is_read) WHERE is_read = false;

-- Trigger pentru actualizarea last_message_at și updated_at
CREATE OR REPLACE FUNCTION public.update_product_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.product_chats
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_chat_timestamp ON public.product_chat_messages;
CREATE TRIGGER trigger_update_product_chat_timestamp
  AFTER INSERT ON public.product_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_chat_timestamp();

-- Trigger pentru updated_at pe product_chats
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_chats_updated_at ON public.product_chats;
CREATE TRIGGER trigger_product_chats_updated_at
  BEFORE UPDATE ON public.product_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies
ALTER TABLE public.product_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy pentru product_chats: utilizatorii pot vedea conversațiile în care sunt implicați
DROP POLICY IF EXISTS "Users can view their product chats" ON public.product_chats;
CREATE POLICY "Users can view their product chats"
  ON public.product_chats
  FOR SELECT
  USING (
    auth.uid() = buyer_user_id OR 
    auth.uid() = seller_user_id
  );

-- Policy pentru product_chats: utilizatorii pot crea conversații noi
DROP POLICY IF EXISTS "Users can create product chats" ON public.product_chats;
CREATE POLICY "Users can create product chats"
  ON public.product_chats
  FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_user_id OR 
    auth.uid() = seller_user_id
  );

-- Policy pentru product_chat_messages: utilizatorii pot vedea mesajele din conversațiile lor
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.product_chat_messages;
CREATE POLICY "Users can view messages in their chats"
  ON public.product_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_chats
      WHERE product_chats.id = product_chat_messages.chat_id
      AND (product_chats.buyer_user_id = auth.uid() OR product_chats.seller_user_id = auth.uid())
    )
  );

-- Policy pentru product_chat_messages: utilizatorii pot trimite mesaje în conversațiile lor
DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.product_chat_messages;
CREATE POLICY "Users can send messages in their chats"
  ON public.product_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_user_id AND
    EXISTS (
      SELECT 1 FROM public.product_chats
      WHERE product_chats.id = product_chat_messages.chat_id
      AND (product_chats.buyer_user_id = auth.uid() OR product_chats.seller_user_id = auth.uid())
    )
  );

-- Policy pentru product_chat_messages: utilizatorii pot marca mesajele ca citite
DROP POLICY IF EXISTS "Users can update messages in their chats" ON public.product_chat_messages;
CREATE POLICY "Users can update messages in their chats"
  ON public.product_chat_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.product_chats
      WHERE product_chats.id = product_chat_messages.chat_id
      AND (product_chats.buyer_user_id = auth.uid() OR product_chats.seller_user_id = auth.uid())
    )
  );

-- Activează Realtime pentru product_chat_messages (pentru actualizări live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_chat_messages;

