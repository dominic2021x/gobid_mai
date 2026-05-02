-- ============================================
-- Support Tickets - Supabase Tables (FĂRĂ RLS - pentru testare)
-- ============================================
-- Rulează acest script PRIMUL pentru a crea tabelele
-- După ce funcționează, poți adăuga RLS policies manual

-- ============================================
-- Tabel: support_tickets
-- ============================================
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

-- ============================================
-- Tabel: ticket_messages
-- ============================================
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

-- ============================================
-- Tabel: support_chat_conversations
-- ============================================
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

-- ============================================
-- Tabel: support_chat_messages
-- ============================================
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
-- Funcții helper pentru actualizarea updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pentru actualizarea automată a updated_at
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

-- ============================================
-- Comentarii pentru documentare
-- ============================================
COMMENT ON TABLE support_tickets IS 'Tichete de suport create de utilizatori';
COMMENT ON TABLE ticket_messages IS 'Mesaje din tichetele de suport';
COMMENT ON TABLE support_chat_conversations IS 'Conversații AI chat pentru suport';
COMMENT ON TABLE support_chat_messages IS 'Mesaje din conversațiile AI chat';

-- ============================================
-- NOTĂ: RLS este dezactivat pentru testare
-- ============================================
-- După ce tabelele sunt create și funcționează,
-- poți adăuga RLS policies manual din Supabase Dashboard
-- sau rulează scriptul supabase-support-tables-rls-only.sql






