-- ============================================
-- Migration: Enable Realtime for admin_internal_conversations
-- ============================================
-- Permite actualizări realtime pentru conversații (pentru last_message_at)

-- Enable Realtime for conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_internal_conversations;
