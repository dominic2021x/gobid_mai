-- Migration: Create chat_requests table for chat approval system
-- Created: 2026-01-19
-- Description: Users can send chat requests that need to be approved before creating a conversation

-- Create chat_requests table
CREATE TABLE IF NOT EXISTS public.chat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE, -- NULL pentru chat-uri directe între utilizatori
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Un user poate trimite doar o singură cerere activă la un alt user pentru același produs
  UNIQUE(sender_user_id, receiver_user_id, product_id)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_chat_requests_sender ON public.chat_requests(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_requests_receiver ON public.chat_requests(receiver_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_requests_status ON public.chat_requests(status);
CREATE INDEX IF NOT EXISTS idx_chat_requests_receiver_status ON public.chat_requests(receiver_user_id, status);

-- Enable RLS (Row Level Security)
ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;

-- Politici RLS
-- Șterge politicile vechi dacă există
DROP POLICY IF EXISTS "Users can view their sent and received requests" ON public.chat_requests;
DROP POLICY IF EXISTS "Authenticated users can create requests" ON public.chat_requests;
DROP POLICY IF EXISTS "Receivers can update request status" ON public.chat_requests;
DROP POLICY IF EXISTS "Senders can delete their requests" ON public.chat_requests;

-- Utilizatorii pot vedea cererile pe care le-au trimis sau le-au primit
CREATE POLICY "Users can view their sent and received requests"
  ON public.chat_requests
  FOR SELECT
  USING (auth.uid() = sender_user_id OR auth.uid() = receiver_user_id);

-- Doar utilizatorii autentificați pot crea cereri
CREATE POLICY "Authenticated users can create requests"
  ON public.chat_requests
  FOR INSERT
  WITH CHECK (auth.uid() = sender_user_id);

-- Doar receiver-ul poate actualiza statusul
CREATE POLICY "Receivers can update request status"
  ON public.chat_requests
  FOR UPDATE
  USING (auth.uid() = receiver_user_id)
  WITH CHECK (auth.uid() = receiver_user_id);

-- Sender-ul poate șterge cererea (anulare)
CREATE POLICY "Senders can delete their requests"
  ON public.chat_requests
  FOR DELETE
  USING (auth.uid() = sender_user_id);

-- Funcție pentru a actualiza updated_at automat
CREATE OR REPLACE FUNCTION update_chat_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Șterge trigger-ul vechi dacă există
DROP TRIGGER IF EXISTS update_chat_requests_updated_at_trigger ON public.chat_requests;

-- Trigger pentru updated_at
CREATE TRIGGER update_chat_requests_updated_at_trigger
  BEFORE UPDATE ON public.chat_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_requests_updated_at();

-- Enable Realtime pentru requests (pentru notificări live)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'chat_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_requests;
  END IF;
END $$;

-- Comentarii pentru documentație
COMMENT ON TABLE public.chat_requests IS 'Stores chat requests that need approval before creating a conversation';
COMMENT ON COLUMN public.chat_requests.sender_user_id IS 'User who sent the chat request';
COMMENT ON COLUMN public.chat_requests.receiver_user_id IS 'User who received the chat request';
COMMENT ON COLUMN public.chat_requests.product_id IS 'Product related to the chat request (optional)';
COMMENT ON COLUMN public.chat_requests.status IS 'Request status: pending, accepted, rejected';
