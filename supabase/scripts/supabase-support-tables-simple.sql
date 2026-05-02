-- ============================================
-- Support Tickets - Supabase Tables (SIMPLIFICAT)
-- ============================================
-- Rulează acest script în Supabase SQL Editor
-- Dacă primești erori, rulează doar prima parte (tabelele), apoi a doua parte (policies)

-- ============================================
-- PARTEA 1: CREAREA TABELELOR
-- ============================================

-- Tabel: support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('technical', 'billing', 'account', 'general')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in-progress', 'resolved', 'closed', 'In asteptare raspuns', 'Am primit raspuns', 'Am raspuns')),
  requested_by TEXT,
  assignee TEXT DEFAULT 'Echipa Suport',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_email ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- Tabel: ticket_messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'admin', 'ai')),
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_timestamp ON ticket_messages(timestamp);

-- Tabel: support_chat_conversations
CREATE TABLE IF NOT EXISTS support_chat_conversations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  subject TEXT DEFAULT 'Chat Tichet AI',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_chat_user_id ON support_chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_user_email ON support_chat_conversations(user_email);
CREATE INDEX IF NOT EXISTS idx_support_chat_status ON support_chat_conversations(status);

-- Tabel: support_chat_messages
CREATE TABLE IF NOT EXISTS support_chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_chat_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_chat_messages_conversation_id ON support_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_timestamp ON support_chat_messages(timestamp);

-- ============================================
-- PARTEA 2: RLS POLICIES (Rulează după ce tabelele sunt create)
-- ============================================

-- Șterge policies existente
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

-- Policies pentru support_tickets (simplificate - doar user_id)
CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can create their own tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own tickets"
  ON support_tickets FOR UPDATE
  USING (auth.uid() = user_id OR user_email = (auth.jwt() ->> 'email'));

-- Policies pentru ticket_messages (simplificate)
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

-- ============================================
-- PARTEA 3: FUNCȚII ȘI TRIGGERS
-- ============================================

-- Funcție pentru actualizarea updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER update_support_tickets_updated_at 
  BEFORE UPDATE ON support_tickets 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_support_chat_conversations_updated_at ON support_chat_conversations;
CREATE TRIGGER update_support_chat_conversations_updated_at 
  BEFORE UPDATE ON support_chat_conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarii
COMMENT ON TABLE support_tickets IS 'Tichete de suport create de utilizatori';
COMMENT ON TABLE ticket_messages IS 'Mesaje din tichetele de suport';
COMMENT ON TABLE support_chat_conversations IS 'Conversații AI chat pentru suport';
COMMENT ON TABLE support_chat_messages IS 'Mesaje din conversațiile AI chat';






