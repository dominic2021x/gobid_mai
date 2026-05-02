-- ============================================
-- Assistant: conversations, messages, state
-- RLS: user can read/write only own data
-- ============================================

-- Conversations
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Conversație nouă',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_id ON public.assistant_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created_at ON public.assistant_conversations (created_at DESC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own conversations" ON public.assistant_conversations;
CREATE POLICY "Users own conversations" ON public.assistant_conversations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation_id ON public.assistant_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created_at ON public.assistant_messages (created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own messages via conversation" ON public.assistant_messages;
CREATE POLICY "Users own messages via conversation" ON public.assistant_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- State (one row per conversation: draft_product_id, wizard state, rate limit)
CREATE TABLE IF NOT EXISTS public.assistant_state (
  conversation_id UUID PRIMARY KEY REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  draft_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'START',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_request_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_state_last_request_at ON public.assistant_state (last_request_at);

ALTER TABLE public.assistant_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own state via conversation" ON public.assistant_state;
CREATE POLICY "Users own state via conversation" ON public.assistant_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.assistant_conversations IS 'Conversații asistent AI per utilizator';
COMMENT ON TABLE public.assistant_messages IS 'Mesaje din conversațiile asistent';
COMMENT ON TABLE public.assistant_state IS 'Stare wizard + draft_product_id + last_request_at pentru rate limit';
