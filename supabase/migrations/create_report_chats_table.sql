-- Create report_chats table for report conversations
CREATE TABLE IF NOT EXISTS public.report_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.user_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(report_id)
);

-- Create report_chat_messages table
CREATE TABLE IF NOT EXISTS public.report_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.report_chats(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_system_message BOOLEAN NOT NULL DEFAULT false,
  message_text TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_report_chats_report_id ON public.report_chats(report_id);
CREATE INDEX IF NOT EXISTS idx_report_chats_user_id ON public.report_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_report_chats_status ON public.report_chats(status);
CREATE INDEX IF NOT EXISTS idx_report_chat_messages_chat_id ON public.report_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_report_chat_messages_sender ON public.report_chat_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_report_chat_messages_created_at ON public.report_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.report_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own report chats" ON public.report_chats;
DROP POLICY IF EXISTS "Admins can view all report chats" ON public.report_chats;
DROP POLICY IF EXISTS "Users can view messages in their report chats" ON public.report_chat_messages;
DROP POLICY IF EXISTS "Admins can view messages in all report chats" ON public.report_chat_messages;
DROP POLICY IF EXISTS "Users can insert messages in their report chats" ON public.report_chat_messages;
DROP POLICY IF EXISTS "Admins can insert messages in all report chats" ON public.report_chat_messages;

-- Policy: Users can view their own report chats
CREATE POLICY "Users can view their own report chats"
  ON public.report_chats
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all report chats
CREATE POLICY "Admins can view all report chats"
  ON public.report_chats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Users can view messages in their report chats
CREATE POLICY "Users can view messages in their report chats"
  ON public.report_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.report_chats
      WHERE report_chats.id = report_chat_messages.chat_id
      AND report_chats.user_id = auth.uid()
    )
  );

-- Policy: Admins can view messages in all report chats
CREATE POLICY "Admins can view messages in all report chats"
  ON public.report_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Users can insert messages in their report chats
CREATE POLICY "Users can insert messages in their report chats"
  ON public.report_chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.report_chats
      WHERE report_chats.id = report_chat_messages.chat_id
      AND report_chats.user_id = auth.uid()
    )
    AND (report_chat_messages.sender_user_id = auth.uid() OR report_chat_messages.sender_user_id IS NULL)
  );

-- Policy: Admins can insert messages in all report chats
CREATE POLICY "Admins can insert messages in all report chats"
  ON public.report_chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Trigger for updating updated_at
DROP TRIGGER IF EXISTS trigger_update_report_chats_updated_at ON public.report_chats;

CREATE OR REPLACE FUNCTION update_report_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_report_chats_updated_at
  BEFORE UPDATE ON public.report_chats
  FOR EACH ROW
  EXECUTE FUNCTION update_report_chats_updated_at();
