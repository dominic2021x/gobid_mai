-- ============================================
-- RLS Policies pentru Support Tables
-- ============================================
-- Rulează acest script DUPĂ ce tabelele sunt create
-- (după ce ai rulat supabase-support-tables-no-rls.sql)

-- Șterge policies existente (dacă există)
DROP POLICY IF EXISTS "Users can view their own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create their own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can update their own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can view messages from their tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Users can create messages in their tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Users can view their own chat conversations" ON support_chat_conversations;
DROP POLICY IF EXISTS "Users can create their own chat conversations" ON support_chat_conversations;
DROP POLICY IF EXISTS "Users can update their own chat conversations" ON support_chat_conversations;
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON support_chat_messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON support_chat_messages;

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies pentru support_tickets
CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can create their own tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own tickets"
  ON support_tickets FOR UPDATE
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

-- Policies pentru ticket_messages
CREATE POLICY "Users can view messages from their tickets"
  ON ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets st
      WHERE st.id = ticket_messages.ticket_id 
      AND (st.user_id = auth.uid() OR st.user_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "Users can create messages in their tickets"
  ON ticket_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets st
      WHERE st.id = ticket_messages.ticket_id 
      AND (st.user_id = auth.uid() OR st.user_email = (auth.jwt() ->> 'email'))
    )
  );

-- Policies pentru support_chat_conversations
CREATE POLICY "Users can view their own chat conversations"
  ON support_chat_conversations FOR SELECT
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can create their own chat conversations"
  ON support_chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own chat conversations"
  ON support_chat_conversations FOR UPDATE
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

-- Policies pentru support_chat_messages
CREATE POLICY "Users can view messages from their conversations"
  ON support_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_chat_conversations scc
      WHERE scc.id = support_chat_messages.conversation_id 
      AND (scc.user_id = auth.uid() OR scc.user_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON support_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_chat_conversations scc
      WHERE scc.id = support_chat_messages.conversation_id 
      AND (scc.user_id = auth.uid() OR scc.user_email = (auth.jwt() ->> 'email'))
    )
  );






