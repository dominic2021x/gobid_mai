-- ============================================
-- Migration: Admin Internal Chat - Attachments & Emoji Support
-- ============================================
-- Adaugă suport pentru imagini/attachment-uri și emoji-uri în chat-ul intern admin

-- Adaugă coloană pentru attachment-uri (URL-uri imagini) în tabelul de mesaje
ALTER TABLE public.admin_internal_messages 
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

-- Creează index pentru căutare rapidă a mesajelor cu attachment-uri
CREATE INDEX IF NOT EXISTS idx_admin_internal_messages_attachments 
  ON public.admin_internal_messages USING GIN (attachment_urls) 
  WHERE array_length(attachment_urls, 1) > 0;

-- Comentarii pentru documentație
COMMENT ON COLUMN public.admin_internal_messages.attachment_urls IS 'Array de URL-uri pentru imagini/attachment-uri atașate mesajului';
